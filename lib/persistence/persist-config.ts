/**
 * EIE_PERSIST_ANALYSIS gating (docs/EIE-v2-upgrade-plan.md §6.1).
 */

export function isPersistenceFlagEnabled(): boolean {
  const v = process.env.EIE_PERSIST_ANALYSIS?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function hasSupabasePersistenceConfig(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}
