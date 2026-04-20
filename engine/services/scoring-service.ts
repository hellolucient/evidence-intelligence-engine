/**
 * Scoring service: evidence coherence score.
 */

import type { EvidenceFlag } from "../types";

const INITIAL_SCORE = 100;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

export function computeCoherenceScore(flags: EvidenceFlag[]): number {
  const totalPenalty = flags.reduce((sum, f) => sum + f.penalty, 0);
  const score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, INITIAL_SCORE - totalPenalty));
  return Math.round(score);
}

