/**
 * Inserts rows into animoca_tasks. Best-effort dedupe for analysis-scoped work items.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnimocaTaskEnqueueInput } from "./analyst-types";

export async function enqueueAnimocaTask(
  client: SupabaseClient,
  input: AnimocaTaskEnqueueInput
): Promise<{ id: string } | null> {
  const status = input.status ?? "queued";
  const { data, error } = await client
    .from("animoca_tasks")
    .insert({
      task_type: input.task_type,
      status,
      analysis_id: input.analysis_id ?? null,
      payload: input.payload ?? {},
      scheduled_for: input.scheduled_for ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("[EIE] animoca_tasks insert failed:", error.message);
    return null;
  }
  return data?.id ? { id: data.id } : null;
}

/**
 * Skip a new row if the same analysis already has a queued task of this type.
 * Digest tasks (no analysis_id) are never deduped here.
 */
export async function enqueueAnimocaTaskDeduped(
  client: SupabaseClient,
  input: AnimocaTaskEnqueueInput
): Promise<{ id: string; deduped: boolean } | null> {
  const analysisId = input.analysis_id ?? null;
  if (analysisId) {
    const { data: existing, error: selErr } = await client
      .from("animoca_tasks")
      .select("id")
      .eq("analysis_id", analysisId)
      .eq("task_type", input.task_type)
      .eq("status", "queued")
      .maybeSingle();

    if (selErr) {
      console.error("[EIE] animoca_tasks dedupe lookup failed:", selErr.message);
    } else if (existing?.id) {
      return { id: existing.id, deduped: true };
    }
  }

  const inserted = await enqueueAnimocaTask(client, input);
  if (!inserted?.id) return null;
  return { id: inserted.id, deduped: false };
}
