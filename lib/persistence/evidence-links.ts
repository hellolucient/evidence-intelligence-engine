import type { SupabaseClient } from "@supabase/supabase-js";
import type { EvidenceMapEntry, ExtractedClaim } from "@/engine/types";
import { getMentionedInterventions } from "@/engine/services/evidence-map";

function canonicalizeIntervention(intervention: string): string {
  return intervention.replace(/\s+/g, " ").trim();
}

export type ClaimEvidenceMatch = {
  claim_index: number;
  intervention: string;
  evidence: EvidenceMapEntry;
};

export function deriveClaimEvidenceMatches(input: {
  claims: ExtractedClaim[];
  evidenceMap: EvidenceMapEntry[];
}): ClaimEvidenceMatch[] {
  const out: ClaimEvidenceMatch[] = [];

  for (let i = 0; i < input.claims.length; i++) {
    const claim = input.claims[i];
    const mentioned = getMentionedInterventions(input.evidenceMap, claim.claim_text);
    for (const e of mentioned) {
      out.push({
        claim_index: i,
        intervention: canonicalizeIntervention(e.intervention),
        evidence: e,
      });
    }
  }

  // De-dupe per claim_index + intervention (same intervention can match multiple stems)
  const seen = new Set<string>();
  return out.filter((m) => {
    const key = `${m.claim_index}:${m.intervention.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function ensureEvidenceEntryId(
  client: SupabaseClient,
  entry: EvidenceMapEntry
): Promise<string | null> {
  const intervention = canonicalizeIntervention(entry.intervention);

  try {
    const { data, error } = await client
      .from("evidence_entries")
      .insert({
        intervention,
        evidence_label: entry.evidence_label,
        human_lifespan_evidence: entry.human_lifespan_evidence,
        human_healthspan_evidence: entry.human_healthspan_evidence,
        animal_lifespan_evidence: entry.animal_lifespan_evidence,
        rct_presence: entry.rct_presence,
        meta_analysis_presence: entry.meta_analysis_presence,
        consensus_guideline: entry.consensus_guideline,
        provenance: "evidence_map_json",
        raw_payload: entry,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data?.id ?? null;
  } catch {
    // Likely unique conflict (lower(trim(intervention))) — fall back to lookup.
    try {
      const { data: exact } = await client
        .from("evidence_entries")
        .select("id")
        .eq("intervention", intervention)
        .maybeSingle();
      if (exact?.id) return exact.id;

      const { data: ci } = await client
        .from("evidence_entries")
        .select("id")
        .ilike("intervention", intervention)
        .maybeSingle();
      return ci?.id ?? null;
    } catch {
      return null;
    }
  }
}

