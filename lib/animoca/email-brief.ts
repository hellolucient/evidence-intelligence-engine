import type { AnalystBrief } from "./analyst-types";

export type AnimocaEmailBrief = {
  to: string;
  subject: string;
  body_text: string;
};

const DEFAULT_TO = "evidence.intelligence.engine@amind.ai";

export function formatAnimocaEmailBrief(input: {
  brief: AnalystBrief;
  to?: string;
}): AnimocaEmailBrief {
  const to = input.to?.trim() || process.env.EIE_EMAIL_TO_MIND?.trim() || DEFAULT_TO;
  const shortTitle = truncate(cleanOneLine(input.brief.query_text), 64);

  const subject = `EIE Analyst Review Request — ${input.brief.analysis_id} — ${shortTitle}`;

  const body_text = [
    "You are receiving an Evidence Intelligence Engine (EIE) analyst brief.",
    "Please review and refine the guarded response and any flagged claims.",
    "Do not redo the full analysis from scratch unless necessary; focus on calibration, wording, and follow-ups.",
    "",
    "=== Analysis Metadata ===",
    `analysis_id: ${input.brief.analysis_id}`,
    `created_at: ${input.brief.created_at}`,
    `coherence_score: ${input.brief.coherence_score}`,
    `review_status: ${input.brief.review_status}`,
    `needs_followup: ${input.brief.needs_followup}`,
    input.brief.review_notes ? `review_notes: ${input.brief.review_notes}` : "review_notes: (none)",
    "",
    "=== Query ===",
    input.brief.query_text,
    "",
    "=== Product Context (optional) ===",
    input.brief.product_context ? safeJson(input.brief.product_context) : "(none)",
    "",
    "=== Source Context (optional) ===",
    input.brief.source_context ? safeJson(input.brief.source_context) : "(none)",
    "",
    "=== Raw Response ===",
    input.brief.raw_response || "(empty)",
    "",
    "=== Extracted Claims ===",
    input.brief.claims.length > 0
      ? input.brief.claims
          .map(
            (c) =>
              `#${c.claim_index} [${c.claim_type}/${c.detected_certainty_level}] ${c.claim_text}`
          )
          .join("\n")
      : "(none)",
    "",
    "=== Evidence Flags ===",
    input.brief.evidence_flags.length > 0
      ? input.brief.evidence_flags
          .map(
            (f) =>
              `#${f.claim_index} [${f.severity}] ${f.flag_type} (-${f.penalty}): ${f.message}`
          )
          .join("\n")
      : "(none)",
    "",
    "=== Linked Evidence (summary) ===",
    input.brief.linked_evidence.length > 0
      ? input.brief.linked_evidence
          .map((l) => `#${l.claim_index} ${l.intervention} — ${l.evidence_label} (${l.link_type})`)
          .join("\n")
      : "(none)",
    "",
    "=== Guarded Response (current) ===",
    input.brief.guarded_response || "(empty)",
    "",
    "=== Requested Actions ===",
    input.brief.recommended_next_actions.length > 0
      ? input.brief.recommended_next_actions
          .map((a) => `- ${a.task_type}: ${a.reason}`)
          .join("\n")
      : "(none)",
    "",
    "=== Output Request ===",
    "Please reply with:",
    "1) A refined guarded response (if edits are needed),",
    "2) Any notes on which claims should be softened/removed,",
    "3) Any follow-up evidence checks recommended.",
  ].join("\n");

  return { to, subject, body_text };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function cleanOneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

