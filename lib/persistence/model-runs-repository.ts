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
  _client: SupabaseClient,
  _rows: ModelRunInsert[]
): Promise<void> {
  // Intentionally empty — wire from model-router / LLM wrapper in a later phase.
}
