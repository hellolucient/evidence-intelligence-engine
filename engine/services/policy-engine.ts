/**
 * Policy engine: detect evidence/certainty mismatches and produce evidence flags.
 */

import type { ExtractedClaim, EvidenceFlag, EvidenceMapEntry } from "../types";
import { getMentionedInterventions } from "./evidence-map";

const PENALTY = {
  lifespan_certainty_mismatch: 25,
  mechanism_to_lifespan_extrapolation: 15,
  unsupported_causal_framing: 20,
  minor_certainty_inflation: 10,
} as const;

export function detectFlags(
  claims: ExtractedClaim[],
  evidenceMap: EvidenceMapEntry[]
): EvidenceFlag[] {
  const flags: EvidenceFlag[] = [];

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    const mentioned = getMentionedInterventions(evidenceMap, claim.claim_text);

    // Rule: lifespan_outcome + strong certainty but no human lifespan evidence
    if (
      claim.claim_type === "lifespan_outcome" &&
      claim.detected_certainty_level === "strong"
    ) {
      const hasHumanLifespan = mentioned.some((e) => e.human_lifespan_evidence);
      if (!hasHumanLifespan && mentioned.length > 0) {
        flags.push({
          type: "lifespan_certainty_mismatch",
          claim_index: i,
          message:
            "Claim states lifespan outcome with strong certainty but human lifespan evidence is absent for mentioned interventions.",
          penalty: PENALTY.lifespan_certainty_mismatch,
        });
      } else if (!hasHumanLifespan) {
        flags.push({
          type: "lifespan_certainty_mismatch",
          claim_index: i,
          message:
            "Claim states lifespan outcome with strong certainty; no human lifespan evidence in evidence map for this topic.",
          penalty: PENALTY.lifespan_certainty_mismatch,
        });
      }
    }

    // Rule: mechanistic claim that implies lifespan extension
    if (
      claim.claim_type === "mechanistic" &&
      claim.detected_certainty_level === "strong"
    ) {
      const impliesLifespan =
        /lifespan|longevity|live longer|extends life/i.test(claim.claim_text);
      if (impliesLifespan) {
        const hasHumanLifespan = mentioned.some(
          (e) => e.human_lifespan_evidence
        );
        if (!hasHumanLifespan) {
          flags.push({
            type: "mechanism_to_lifespan_extrapolation",
            claim_index: i,
            message:
              "Mechanism described with strong certainty and lifespan implication; human lifespan evidence not established.",
            penalty: PENALTY.mechanism_to_lifespan_extrapolation,
          });
        }
      }
    }

    // Rule: causal framing ("X causes Y") without strong evidence
    const causalFraming =
      /\b(causes?|prevents?|extends?|reduces?)\b/i.test(claim.claim_text);
    if (
      causalFraming &&
      claim.detected_certainty_level === "strong" &&
      mentioned.length > 0
    ) {
      const allSupported = mentioned.every(
        (e) => e.evidence_label === "supported" || e.evidence_label === "established"
      );
      if (!allSupported) {
        flags.push({
          type: "unsupported_causal_framing",
          claim_index: i,
          message:
            "Causal framing with strong certainty for interventions not in supported/established tier.",
          penalty: PENALTY.unsupported_causal_framing,
        });
      }
    }

    // Rule: minor certainty inflation (moderate/speculative evidence, strong wording)
    if (claim.detected_certainty_level === "strong" && mentioned.length > 0) {
      const weakEvidence = mentioned.some(
        (e) => e.evidence_label === "experimental" || e.evidence_label === "emerging"
      );
      if (
        weakEvidence &&
        !flags.some((f) => f.claim_index === i && f.type !== "minor_certainty_inflation")
      ) {
        flags.push({
          type: "minor_certainty_inflation",
          claim_index: i,
          message:
            "Strong certainty wording for intervention(s) with experimental/emerging evidence only.",
          penalty: PENALTY.minor_certainty_inflation,
        });
      }
    }
  }

  return flags;
}

