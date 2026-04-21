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

/**
 * When true (and persistence succeeded), best-effort animoca_tasks rows may be enqueued off-thread.
 * Unset/false = no automatic enqueue (Phase 8 default).
 */
export function isAnimocaTaskEnqueueEnabled(): boolean {
  const v = process.env.EIE_ENQUEUE_ANIMOCA_TASKS?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * When true (and persistence succeeded), best-effort email send to Mind may be triggered.
 * Unset/false = no auto-send (manual operator action only).
 */
export function isAnimocaEmailAutoSendEnabled(): boolean {
  const v = process.env.EIE_EMAIL_ANIMOCA_AFTER_ANALYSIS?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
