/**
 * Feature flags for the Evidence Intelligence Engine.
 */

/** Curated intervention JSON map — off by default in the current product version. */
export function useEvidenceMap(): boolean {
  return process.env.EIE_USE_EVIDENCE_MAP === "true";
}
