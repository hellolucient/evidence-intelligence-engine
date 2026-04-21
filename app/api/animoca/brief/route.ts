import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { hasSupabasePersistenceConfig } from "@/lib/persistence/persist-config";
import { buildAnalystBrief } from "@/lib/animoca/analyst-service";
import { formatAnimocaEmailBrief } from "@/lib/animoca/email-brief";

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
      return NextResponse.json(
        { status: "missing_persistence_config" as const },
        { status: 200 }
      );
    }

    const client = createSupabaseAdmin();
    const brief = await buildAnalystBrief(analysis_id, client);
    if (!brief) {
      return NextResponse.json({ error: "Analysis not found (or brief build failed)." }, { status: 404 });
    }

    const email = formatAnimocaEmailBrief({ brief });
    console.info(`[EIE] animoca_email: brief generated for analysis_id=${analysis_id}`);

    return NextResponse.json({
      status: "ok" as const,
      analysis_id: brief.analysis_id,
      created_at: brief.created_at,
      query_text: brief.query_text,
      coherence_score: brief.coherence_score,
      to: email.to,
      subject: email.subject,
      body_text: email.body_text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error occurred.";
    console.error("[EIE] animoca_email: brief route failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

