import { Resend } from "resend";

export type EmailSendResult =
  | { status: "success"; id?: string }
  | { status: "missing_email_config"; reason: string }
  | { status: "failure"; reason: string };

export type ResendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

export function getResendEmailConfig(): {
  ok: true;
  apiKey: string;
  from: string;
} | {
  ok: false;
  reason: string;
} {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY is not set" };

  const from = process.env.EIE_EMAIL_FROM?.trim();
  if (!from) return { ok: false, reason: "EIE_EMAIL_FROM is not set" };

  return { ok: true, apiKey, from };
}

export async function sendEmailViaResend(
  input: ResendEmailInput
): Promise<EmailSendResult> {
  const cfg = getResendEmailConfig();
  if (!cfg.ok) return { status: "missing_email_config", reason: cfg.reason };

  try {
    const resend = new Resend(cfg.apiKey);
    const res = await resend.emails.send({
      from: cfg.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    // Resend returns { data, error } depending on version; normalize to success/failure.
    const anyRes = res as unknown as { data?: { id?: string } | null; error?: { message?: string } | null };
    if (anyRes?.error) {
      return {
        status: "failure",
        reason: anyRes.error.message ?? "Resend error",
      };
    }

    return { status: "success", id: anyRes?.data?.id };
  } catch (err) {
    return {
      status: "failure",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

