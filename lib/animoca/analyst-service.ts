/**
 * Animoca analyst scaffolding — enqueue helpers and brief builder entrypoints.
 * No transport, no external Animoca API. Safe to call from workers/cron later.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyzeResponse } from "@/engine/types";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { AnimocaTaskEnqueueInput, AnalystBrief } from "./analyst-types";
import { buildAnalystBrief as buildAnalystBriefWithClient } from "./brief-builder";
import { enqueueAnimocaTask, enqueueAnimocaTaskDeduped } from "./task-repository";

export type { AnalystBrief, AnimocaTaskType, AnimocaTaskStatus } from "./analyst-types";
export { ANIMOCA_TASK_TYPES } from "./analyst-types";

/**
 * Public entry: loads the admin client unless a client is supplied (e.g. tests).
 */
export async function buildAnalystBrief(
  analysisId: string,
  client?: SupabaseClient
): Promise<AnalystBrief | null> {
  const db = client ?? createSupabaseAdmin();
  return buildAnalystBriefWithClient(db, analysisId);
}

export async function enqueueReviewFlaggedAnalysis(
  client: SupabaseClient,
  analysisId: string,
  summary: Record<string, unknown>
): Promise<{ id: string; deduped: boolean } | null> {
  return enqueueAnimocaTaskDeduped(client, {
    task_type: "review_flagged_analysis",
    analysis_id: analysisId,
    payload: { analysis_id: analysisId, ...summary },
  });
}

export async function enqueueAnalystBriefTask(
  client: SupabaseClient,
  analysisId: string,
  extraPayload?: Record<string, unknown>
): Promise<{ id: string; deduped: boolean } | null> {
  return enqueueAnimocaTaskDeduped(client, {
    task_type: "analyst_brief",
    analysis_id: analysisId,
    payload: { analysis_id: analysisId, ...extraPayload },
  });
}

export async function enqueueStaleEvidenceCheck(
  client: SupabaseClient,
  analysisId: string,
  extraPayload?: Record<string, unknown>
): Promise<{ id: string; deduped: boolean } | null> {
  return enqueueAnimocaTaskDeduped(client, {
    task_type: "stale_evidence_check",
    analysis_id: analysisId,
    payload: { analysis_id: analysisId, ...extraPayload },
  });
}

export async function enqueueDigestDaily(
  client: SupabaseClient,
  payload: Record<string, unknown>,
  scheduledFor?: string | null
): Promise<{ id: string } | null> {
  return enqueueAnimocaTask(client, {
    task_type: "digest_daily",
    analysis_id: null,
    payload,
    scheduled_for: scheduledFor ?? null,
  });
}

export async function enqueueDigestWeekly(
  client: SupabaseClient,
  payload: Record<string, unknown>,
  scheduledFor?: string | null
): Promise<{ id: string } | null> {
  return enqueueAnimocaTask(client, {
    task_type: "digest_weekly",
    analysis_id: null,
    payload,
    scheduled_for: scheduledFor ?? null,
  });
}

/**
 * Optional post-persist hook: queues human-review work when the model surfaced evidence flags.
 * Caller should not await this on the request critical path; swallow errors.
 */
export async function enqueueAnimocaTasksAfterPersist(
  client: SupabaseClient,
  analysisId: string,
  result: AnalyzeResponse
): Promise<void> {
  if (result.evidence_flags.length > 0) {
    await enqueueReviewFlaggedAnalysis(client, analysisId, {
      flag_count: result.evidence_flags.length,
      flag_types: [...new Set(result.evidence_flags.map((f) => f.type))],
      coherence_score: result.coherence_score,
      claim_count: result.claims.length,
    });
  }
}

export async function enqueueRawAnimocaTask(
  client: SupabaseClient,
  input: AnimocaTaskEnqueueInput
): Promise<{ id: string } | null> {
  return enqueueAnimocaTask(client, input);
}
