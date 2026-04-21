import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { hasSupabasePersistenceConfig } from "@/lib/persistence/persist-config";
import { buildAnalystBrief } from "@/lib/animoca/analyst-service";
import { formatAnimocaEmailBrief } from "@/lib/animoca/email-brief";
import { sendEmailViaResend } from "@/lib/email/send-resend";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
    }

    const maybe = body as { analysis_id?: unknown } | null;
    const analysis_id = typeof maybe?.analysis_id === "string" ? maybe.analysis_id.trim() : null;
    if (!analysis_id) {
      return NextResponse.json({ error: "Missing or invalid 'analysis_id'." }, { status: 400 });
    }

    if (!hasSupabasePersistenceConfig()) {
      return NextResponse.json({ status: "missing_persistence_config" as const }, { status: 200 });
    }

    const client = createSupabaseAdmin();
    const brief = await buildAnalystBrief(analysis_id, client);
    if (!brief) {
      return NextResponse.json({ error: "Analysis not found (or brief build failed)." }, { status: 404 });
    }

    const email = formatAnimocaEmailBrief({ brief });
    console.info(`[EIE] animoca_email: send attempted analysis_id=${analysis_id} to=${email.to}`);

    const sendRes = await sendEmailViaResend({
      to: email.to,
      subject: email.subject,
      text: email.body_text,
    });

    if (sendRes.status === "missing_email_config") {
      console.warn(`[EIE] animoca_email: missing config (${sendRes.reason})`);
      return NextResponse.json(
        { status: "missing_email_config" as const, reason: sendRes.reason },
        { status: 200 }
      );
    }
    if (sendRes.status === "failure") {
      console.error(`[EIE] animoca_email: send failed (${sendRes.reason})`);
      return NextResponse.json(
        { status: "failure" as const, reason: sendRes.reason },
        { status: 200 }
      );
    }

    console.info(`[EIE] animoca_email: send succeeded id=${sendRes.id ?? "(unknown)"}`);
    return NextResponse.json({ status: "success" as const, id: sendRes.id ?? null }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error occurred.";
    console.error("[EIE] animoca_email: send route failed:", message);
    return NextResponse.json({ status: "failure" as const, reason: message }, { status: 500 });
  }
}

