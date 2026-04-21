/**
 * Persist a completed analyze() result to Supabase (analyses, claims, evidence_flags, rewrites).
 * Canonical guarded text: `rewrites` + mirror on `analyses.guarded_response` (same transaction sequence).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyzeInput, AnalyzeResponse, EvidenceFlag } from "@/engine/types";
import { loadEvidenceMap } from "@/engine/services/evidence-map";
import { severityFromPenalty } from "./flags";
import {
  deriveClaimEvidenceMatches,
  ensureEvidenceEntryId,
} from "./evidence-links";

const GUARDED_KIND = "guarded";

export async function persistCompletedAnalysis(
  client: SupabaseClient,
  input: AnalyzeInput,
  result: AnalyzeResponse
): Promise<string> {
  let analysisId: string | null = null;

  try {
    // Optional Phase 6: persist product/source context when present (best-effort).
    let product_id: string | null = null;
    let source_id: string | null = null;

    if (input.product?.name) {
      try {
        const { data, error } = await client
          .from("products")
          .insert({
            name: input.product.name,
            brand: input.product.brand ?? null,
            variant_or_sku: input.product.variant_or_sku ?? null,
            category: input.product.category ?? null,
            region_or_market: input.product.region_or_market ?? null,
            metadata: input.product.metadata ?? {},
          })
          .select("id")
          .single();
        if (!error && data?.id) product_id = data.id;
      } catch (err) {
        console.error("[EIE] Product persist failed (non-fatal):", err);
      }
    }

    if (input.source?.source_type) {
      try {
        const { data, error } = await client
          .from("sources")
          .insert({
            source_type: input.source.source_type,
            title: input.source.title ?? null,
            raw_text: input.source.raw_text ?? null,
            extracted_text: input.source.extracted_text ?? null,
            source_url: input.source.source_url ?? null,
            content_hash: input.source.content_hash ?? null,
            metadata: input.source.metadata ?? {},
          })
          .select("id")
          .single();
        if (!error && data?.id) source_id = data.id;
      } catch (err) {
        console.error("[EIE] Source persist failed (non-fatal):", err);
      }
    }

    const { data: analysisRow, error: analysisError } = await client
      .from("analyses")
      .insert({
        query_text: input.query,
        include_pubmed: input.includePubmed ?? false,
        product_id,
        source_id,
        raw_response: result.raw_response,
        guarded_response: result.guarded_response,
        coherence_score: result.coherence_score,
        pubmed_summary: result.pubmed_summary ?? null,
        claim_study_data: result.claim_study_data ?? null,
        metadata: { persist_version: "phase6" },
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
        product_id,
        source_id,
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

    // Optional Phase 6: persist claim↔evidence linkages derived from the existing matcher.
    // Best-effort and non-fatal: failure here should not roll back core analysis persistence.
    if (result.claims.length > 0 && analysisId) {
      try {
        const evidenceMap = await loadEvidenceMap();
        const matches = deriveClaimEvidenceMatches({
          claims: result.claims,
          evidenceMap,
        });

        if (matches.length > 0) {
          const evidenceIdByIntervention = new Map<string, string>();

          for (const m of matches) {
            const key = m.intervention.toLowerCase();
            if (evidenceIdByIntervention.has(key)) continue;
            const evidenceId = await ensureEvidenceEntryId(client, m.evidence);
            if (evidenceId) evidenceIdByIntervention.set(key, evidenceId);
          }

          const linkRows = matches
            .map((m) => {
              const claim_id = claimIdByIndex.get(m.claim_index);
              const evidence_entry_id = evidenceIdByIntervention.get(
                m.intervention.toLowerCase()
              );
              if (!claim_id || !evidence_entry_id) return null;
              return {
                claim_id,
                evidence_entry_id,
                link_type: "mentioned_intervention",
                metadata: {
                  claim_index: m.claim_index,
                  intervention: m.intervention,
                  evidence_label: m.evidence.evidence_label,
                  derived_from: "evidence_map_json_matcher",
                },
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          if (linkRows.length > 0) {
            const { error: linkErr } = await client
              .from("claim_evidence_links")
              .upsert(linkRows, {
                onConflict: "claim_id,evidence_entry_id,link_type",
              });
            if (linkErr) throw linkErr;
          }
        }
      } catch (err) {
        console.error("[EIE] claim_evidence_links persist failed (non-fatal):", err);
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

    if (!analysisId) {
      throw new Error("Invariant: analysis persist finished without analysis id");
    }
    return analysisId;
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
