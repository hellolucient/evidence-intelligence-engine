/**
 * Persist a completed analyze() result to Supabase (analyses, claims, evidence_flags, rewrites).
 * Canonical guarded text: `rewrites` + mirror on `analyses.guarded_response` (same transaction sequence).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyzeInput, AnalyzeResponse, EvidenceFlag } from "@/engine/types";
import { severityFromPenalty } from "./flags";

const GUARDED_KIND = "guarded";

export async function persistCompletedAnalysis(
  client: SupabaseClient,
  input: AnalyzeInput,
  result: AnalyzeResponse
): Promise<void> {
  let analysisId: string | null = null;

  try {
    const { data: analysisRow, error: analysisError } = await client
      .from("analyses")
      .insert({
        query_text: input.query,
        include_pubmed: input.includePubmed ?? false,
        raw_response: result.raw_response,
        guarded_response: result.guarded_response,
        coherence_score: result.coherence_score,
        pubmed_summary: result.pubmed_summary ?? null,
        claim_study_data: result.claim_study_data ?? null,
        metadata: { persist_version: "phase3" },
      })
      .select("id")
      .single();

    if (analysisError) throw analysisError;
    if (!analysisRow?.id) throw new Error("Analysis insert returned no id");
    analysisId = analysisRow.id;

    let claimIdByIndex = new Map<number, string>();

    if (result.claims.length > 0) {
      const claimRows = result.claims.map((c, index) => ({
        analysis_id: analysisId,
        claim_index: index,
        claim_text: c.claim_text,
        claim_type: c.claim_type,
        detected_certainty_level: c.detected_certainty_level,
      }));

      const { data: claimData, error: claimsError } = await client
        .from("claims")
        .insert(claimRows)
        .select("id, claim_index");

      if (claimsError) throw claimsError;

      claimIdByIndex = new Map<number, string>();
      for (const row of claimData ?? []) {
        if (typeof row.claim_index === "number" && row.id) {
          claimIdByIndex.set(row.claim_index, row.id);
        }
      }
    }

    if (result.evidence_flags.length > 0) {
      const flagRows = result.evidence_flags.map((f: EvidenceFlag) => ({
        analysis_id: analysisId,
        claim_index: f.claim_index,
        claim_id: claimIdByIndex.get(f.claim_index) ?? null,
        flag_type: f.type,
        severity: severityFromPenalty(f.penalty),
        penalty: f.penalty,
        message: f.message,
        metadata: {},
      }));

      const { error: flagsError } = await client.from("evidence_flags").insert(flagRows);
      if (flagsError) throw flagsError;
    }

    const { error: rewriteError } = await client.from("rewrites").insert({
      analysis_id: analysisId,
      kind: GUARDED_KIND,
      body: result.guarded_response,
      metadata: {},
    });

    if (rewriteError) throw rewriteError;
  } catch (err) {
    if (analysisId) {
      const { error: delErr } = await client.from("analyses").delete().eq("id", analysisId);
      if (delErr) {
        console.error("[EIE] Failed to roll back partial analysis row:", delErr);
      }
    }
    throw err;
  }
}
