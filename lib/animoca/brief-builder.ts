/**
 * Builds a structured analyst brief from persisted Supabase rows (Phase 8).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalystBrief,
  AnalystBriefClaim,
  AnalystBriefEvidenceLink,
  AnalystBriefFlag,
  AnalystBriefRecommendedAction,
} from "./analyst-types";

type AnalysisRow = {
  id: string;
  created_at: string;
  query_text: string;
  coherence_score: number;
  review_status: string;
  needs_followup: boolean;
  review_notes: string | null;
  raw_response: string;
  guarded_response: string;
  product_id: string | null;
  source_id: string | null;
};

export async function buildAnalystBrief(
  client: SupabaseClient,
  analysisId: string
): Promise<AnalystBrief | null> {
  const { data: analysis, error: aErr } = await client
    .from("analyses")
    .select(
      "id, created_at, query_text, coherence_score, review_status, needs_followup, review_notes, raw_response, guarded_response, product_id, source_id"
    )
    .eq("id", analysisId)
    .maybeSingle();

  if (aErr || !analysis) {
    if (aErr) console.error("[EIE] buildAnalystBrief analysis load failed:", aErr.message);
    return null;
  }

  const row = analysis as AnalysisRow;

  const [{ data: claimRows }, { data: flagRows }, productRes, sourceRes] = await Promise.all([
    client
      .from("claims")
      .select("id, claim_index, claim_text, claim_type, detected_certainty_level, needs_followup")
      .eq("analysis_id", analysisId)
      .order("claim_index", { ascending: true }),
    client
      .from("evidence_flags")
      .select("claim_index, flag_type, severity, penalty, message")
      .eq("analysis_id", analysisId),
    row.product_id
      ? client.from("products").select("*").eq("id", row.product_id).maybeSingle()
      : Promise.resolve({ data: null as Record<string, unknown> | null }),
    row.source_id
      ? client.from("sources").select("*").eq("id", row.source_id).maybeSingle()
      : Promise.resolve({ data: null as Record<string, unknown> | null }),
  ]);

  const claims: AnalystBriefClaim[] = (claimRows ?? []).map((c) => ({
    claim_index: c.claim_index,
    claim_text: c.claim_text,
    claim_type: c.claim_type,
    detected_certainty_level: c.detected_certainty_level,
    needs_followup: c.needs_followup,
  }));

  const flags: AnalystBriefFlag[] = (flagRows ?? []).map((f) => ({
    claim_index: f.claim_index,
    flag_type: f.flag_type,
    severity: f.severity,
    penalty: f.penalty,
    message: f.message,
  }));

  const claimIds = (claimRows ?? []).map((c) => c.id).filter(Boolean) as string[];
  const claimIndexById = new Map<string, number>();
  for (const c of claimRows ?? []) {
    if (c.id) claimIndexById.set(c.id, c.claim_index);
  }

  let linkedEvidence: AnalystBriefEvidenceLink[] = [];
  if (claimIds.length > 0) {
    const { data: linkRows, error: linkErr } = await client
      .from("claim_evidence_links")
      .select(
        "claim_id, evidence_entry_id, link_type, evidence_entries ( intervention, evidence_label )"
      )
      .in("claim_id", claimIds);

    if (linkErr) {
      console.error("[EIE] buildAnalystBrief links load failed:", linkErr.message);
    } else {
      linkedEvidence =
        linkRows?.map((r) => {
          const ev = normalizeEvidenceEmbed(r.evidence_entries);
          const claim_id = r.claim_id as string;
          return {
            claim_index: claimIndexById.get(claim_id) ?? -1,
            claim_id,
            evidence_entry_id: r.evidence_entry_id as string,
            link_type: r.link_type as string,
            intervention: ev?.intervention ?? "",
            evidence_label: ev?.evidence_label ?? "",
          };
        }) ?? [];
    }
  }

  const recommended = deriveRecommendedActions({
    review_status: row.review_status,
    needs_followup: row.needs_followup,
    flags,
    linkedEvidence,
  });

  return {
    analysis_id: row.id,
    created_at: row.created_at,
    query_text: row.query_text,
    coherence_score: row.coherence_score,
    review_status: row.review_status,
    needs_followup: row.needs_followup,
    review_notes: row.review_notes,
    raw_response: row.raw_response,
    guarded_response: row.guarded_response,
    claims,
    evidence_flags: flags,
    linked_evidence: linkedEvidence,
    product_context: productRes.data ?? null,
    source_context: sourceRes.data ?? null,
    recommended_next_actions: recommended,
  };
}

function normalizeEvidenceEmbed(
  raw: unknown
): { intervention: string; evidence_label: string } | null {
  if (raw == null) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  return {
    intervention: typeof o.intervention === "string" ? o.intervention : "",
    evidence_label: typeof o.evidence_label === "string" ? o.evidence_label : "",
  };
}

function deriveRecommendedActions(input: {
  review_status: string;
  needs_followup: boolean;
  flags: AnalystBriefFlag[];
  linkedEvidence: AnalystBriefEvidenceLink[];
}): AnalystBriefRecommendedAction[] {
  const actions: AnalystBriefRecommendedAction[] = [];

  if (input.flags.length > 0) {
    const high = input.flags.filter((f) => f.severity === "high").length;
    actions.push({
      task_type: "review_flagged_analysis",
      reason:
        high > 0
          ? `Analysis has ${input.flags.length} evidence flag(s) including ${high} high-severity; human review recommended.`
          : `Analysis has ${input.flags.length} evidence flag(s); review recommended.`,
    });
  }

  if (input.review_status === "flagged" || input.review_status === "needs_followup") {
    actions.push({
      task_type: "analyst_brief",
      reason: `review_status=${input.review_status}; prepare or refresh analyst brief for handoff.`,
    });
  }

  if (input.needs_followup) {
    actions.push({
      task_type: "analyst_brief",
      reason: "needs_followup is set on the analysis record.",
    });
  }

  if (input.linkedEvidence.length > 0) {
    actions.push({
      task_type: "stale_evidence_check",
      reason: "Linked evidence entries exist; periodic staleness review may be appropriate.",
    });
  }

  return dedupeActions(actions);
}

function dedupeActions(actions: AnalystBriefRecommendedAction[]): AnalystBriefRecommendedAction[] {
  const seen = new Set<string>();
  const out: AnalystBriefRecommendedAction[] = [];
  for (const a of actions) {
    const key = a.task_type;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
