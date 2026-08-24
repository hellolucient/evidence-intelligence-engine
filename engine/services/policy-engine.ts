/**
 * Policy engine: detect evidence/certainty mismatches and produce evidence flags.
 */

import { useEvidenceMap } from "../config";
import type { ExtractedClaim, EvidenceFlag, EvidenceMapEntry } from "../types";
import {
  analyzeQueryScope,
  getMentionedInterventions,
} from "./evidence-map";

const PENALTY = {
  lifespan_certainty_mismatch: 25,
  mechanism_to_lifespan_extrapolation: 15,
  unsupported_causal_framing: 20,
  minor_certainty_inflation: 10,
  intervention_not_in_evidence_map: 20,
  tangential_scope_match: 15,
} as const;

const QUERY_LEVEL_FLAG_INDEX = -1;

const CAUSAL_FRAMING_PATTERN =
  /\b(causes?|prevents?|extends?|reduces?|improves?|improve|boosts?|boost|enhances?|enhance|increases?|increase|promotes?|promote|helps?|help|supports?|support|optimizes?|optimize|strengthens?|strengthen|lowers?|lower|raises?|raise)\b/i;

function hasCausalFraming(text: string): boolean {
  return CAUSAL_FRAMING_PATTERN.test(text);
}

function isSupportedTier(entry: EvidenceMapEntry): boolean {
  return entry.evidence_label === "supported" || entry.evidence_label === "established";
}

/**
 * Lightweight flags based on claim wording only — no curated evidence map required.
 */
function detectFlagsFromClaimText(claims: ExtractedClaim[]): EvidenceFlag[] {
  const flags: EvidenceFlag[] = [];

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];

    if (
      claim.claim_type === "lifespan_outcome" &&
      claim.detected_certainty_level === "strong"
    ) {
      flags.push({
        type: "lifespan_certainty_mismatch",
        claim_index: i,
        message:
          "Claim states lifespan outcome with strong certainty; verify human lifespan evidence independently.",
        penalty: PENALTY.lifespan_certainty_mismatch,
      });
    }

    if (
      hasCausalFraming(claim.claim_text) &&
      claim.detected_certainty_level === "strong" &&
      (claim.claim_type === "intervention_effect" ||
        claim.claim_type === "healthspan_outcome")
    ) {
      flags.push({
        type: "unsupported_causal_framing",
        claim_index: i,
        message:
          "Strong causal or benefit framing — confirm against linked literature before treating as established.",
        penalty: PENALTY.unsupported_causal_framing,
      });
    }
  }

  return flags;
}

function detectFlagsWithEvidenceMap(
  claims: ExtractedClaim[],
  evidenceMap: EvidenceMapEntry[],
  query?: string
): EvidenceFlag[] {
  const flags: EvidenceFlag[] = [];
  const scope = query ? analyzeQueryScope(evidenceMap, query) : null;

  if (scope?.tangentialMatchOnly) {
    flags.push({
      type: "tangential_scope_match",
      claim_index: QUERY_LEVEL_FLAG_INDEX,
      message: `Query subject "${scope.primarySubject}" is not in the curated evidence map; analysis was allowed only because of a related keyword (e.g. ${scope.matchedInterventions.map((e) => e.intervention).join(", ")}).`,
      penalty: PENALTY.tangential_scope_match,
    });
  }

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    const mentioned = getMentionedInterventions(evidenceMap, claim.claim_text);
    const mapBackedMentioned = scope?.tangentialMatchOnly ? [] : mentioned;

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

    const isEffectClaim =
      claim.claim_type === "intervention_effect" ||
      claim.claim_type === "healthspan_outcome" ||
      hasCausalFraming(claim.claim_text);

    if (mapBackedMentioned.length === 0) {
      const alreadyFlagged = flags.some(
        (f) =>
          f.claim_index === i && f.type === "intervention_not_in_evidence_map"
      );

      if (!alreadyFlagged && (isEffectClaim || scope?.tangentialMatchOnly)) {
        flags.push({
          type: "intervention_not_in_evidence_map",
          claim_index: i,
          message: scope?.tangentialMatchOnly
            ? `Claim concerns "${scope.primarySubject}", which is not in the curated evidence map.`
            : "Claim references an intervention or product that is not in the curated evidence map; evidence tier cannot be verified.",
          penalty: PENALTY.intervention_not_in_evidence_map,
        });
      }
    }

    if (hasCausalFraming(claim.claim_text)) {
      const strongOrModerate =
        claim.detected_certainty_level === "strong" ||
        claim.detected_certainty_level === "moderate";

      if (strongOrModerate && mapBackedMentioned.length > 0) {
        const allSupported = mapBackedMentioned.every(isSupportedTier);
        if (!allSupported) {
          flags.push({
            type: "unsupported_causal_framing",
            claim_index: i,
            message:
              "Benefit or causal framing for intervention(s) not in supported/established evidence tier.",
            penalty: PENALTY.unsupported_causal_framing,
          });
        }
      }

      if (
        claim.detected_certainty_level === "strong" &&
        mapBackedMentioned.length === 0 &&
        !flags.some(
          (f) =>
            f.claim_index === i && f.type === "intervention_not_in_evidence_map"
        )
      ) {
        flags.push({
          type: "unsupported_causal_framing",
          claim_index: i,
          message:
            "Strong causal or benefit framing for a topic with no curated evidence-map entry.",
          penalty: PENALTY.unsupported_causal_framing,
        });
      }
    }

    if (claim.detected_certainty_level === "strong" && mapBackedMentioned.length > 0) {
      const weakEvidence = mapBackedMentioned.some(
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

export function detectFlags(
  claims: ExtractedClaim[],
  evidenceMap: EvidenceMapEntry[],
  query?: string
): EvidenceFlag[] {
  if (!useEvidenceMap()) {
    return detectFlagsFromClaimText(claims);
  }
  return detectFlagsWithEvidenceMap(claims, evidenceMap, query);
}
