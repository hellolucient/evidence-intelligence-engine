/**
 * Model run audit rows (Phase 5+). Stub keeps a single extension point without wiring from the engine yet.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Shape aligned with `model_runs` table for future inserts. */
export type ModelRunInsert = {
  analysis_id: string | null;
  prompt_version: string;
  task_type: string;
  provider: string;
  model: string;
  latency_ms: number;
  estimated_tokens_in?: number | null;
  estimated_tokens_out?: number | null;
  estimated_cost_usd?: number | null;
  status: "success" | "failure";
  error_message?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Insert one or more model run records. No-op until the model router logs calls here (Phase 5).
 */
export async function insertModelRuns(
  client: SupabaseClient,
  rows: ModelRunInsert[]
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await client.from("model_runs").insert(
    rows.map((r) => ({
      analysis_id: r.analysis_id,
      prompt_version: r.prompt_version,
      task_type: r.task_type,
      provider: r.provider,
      model: r.model,
      latency_ms: r.latency_ms,
      estimated_tokens_in: r.estimated_tokens_in ?? null,
      estimated_tokens_out: r.estimated_tokens_out ?? null,
      estimated_cost_usd: r.estimated_cost_usd ?? null,
      status: r.status,
      error_message: r.error_message ?? null,
      metadata: r.metadata ?? {},
    }))
  );

  if (error) throw error;
}
