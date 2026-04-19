/**
 * Map runtime evidence flag penalty → persisted severity (docs/EIE-v2-upgrade-plan.md §3.7).
 */

export type FlagSeverity = "low" | "medium" | "high";

export function severityFromPenalty(penalty: number): FlagSeverity {
  if (penalty >= 20) return "high";
  if (penalty >= 15) return "medium";
  return "low";
}
