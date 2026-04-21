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
      "[EIE] model_runs: skipped — Supabase URL or service role key missing while EIE_PERSIST_ANALYSIS is on"
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
    console.error("[EIE] model_runs: insert failed (non-fatal):", err);
  }
}

