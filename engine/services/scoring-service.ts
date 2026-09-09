/**
 * Scoring service: evidence coherence score.
 */

import type { EvidenceFlag, EvidenceFlagType } from "../types";

const INITIAL_SCORE = 100;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

/** Epistemic notes, not overclaim. Do not fold these into ECS. */
const EXCLUDED_FROM_SCORE: EvidenceFlagType[] = ["class_to_specific_extrapolation"];

export function computeCoherenceScore(flags: EvidenceFlag[]): number {
  const totalPenalty = flags
    .filter((flag) => !EXCLUDED_FROM_SCORE.includes(flag.type))
    .reduce((sum, flag) => sum + flag.penalty, 0);
  const score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, INITIAL_SCORE - totalPenalty));
  return Math.round(score);
}

