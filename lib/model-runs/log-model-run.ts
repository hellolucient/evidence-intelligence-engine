import { createSupabaseAdmin } from "@/lib/supabase/server";
import { hasSupabasePersistenceConfig, isPersistenceFlagEnabled } from "@/lib/persistence/persist-config";
import { insertModelRuns, type ModelRunInsert } from "@/lib/persistence/model-runs-repository";

/**
 * Non-fatal model_runs logging (Phase 5).
 *
 * Minimal gating: uses the existing persistence flag/env so it can never break prod by default.
 * - Flag off: skip silently
 * - Flag on + env missing: warn + skip
 * - Insert fails: log + skip
 */
export async function logModelRunNonFatal(row: ModelRunInsert): Promise<void> {
  if (!isPersistenceFlagEnabled()) return;

  if (!hasSupabasePersistenceConfig()) {
    console.warn(
      "[EIE] EIE_PERSIST_ANALYSIS is enabled but Supabase env is missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY); skipping model_runs logging."
    );
    return;
  }

  try {
    const client = createSupabaseAdmin();
    await insertModelRuns(client, [
      {
        ...row,
        metadata: row.metadata ?? {},
      },
    ]);
  } catch (err) {
    console.error("[EIE] model_runs insert failed:", err);
  }
}

