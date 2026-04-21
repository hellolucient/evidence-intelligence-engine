/**
 * Application entry for analyze: runs the engine, then optionally persists (Phase 3).
 * Persistence gating: docs/EIE-v2-upgrade-plan.md §6.1
 */

import { analyze } from "@/engine";
import type { AnalyzeInput, AnalyzeResponse, PubMedSummary } from "@/engine/types";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { persistCompletedAnalysis } from "@/lib/persistence/analysis-repository";
import {
  hasSupabasePersistenceConfig,
  isAnimocaEmailAutoSendEnabled,
  isAnimocaTaskEnqueueEnabled,
  isPersistenceFlagEnabled,
} from "@/lib/persistence/persist-config";
import { enqueueAnimocaTasksAfterPersist } from "@/lib/animoca/analyst-service";
import { sendEmailViaResend } from "@/lib/email/send-resend";
import { formatAnimocaEmailBrief } from "@/lib/animoca/email-brief";
import { buildAnalystBrief } from "@/lib/animoca/analyst-service";

export type RunAnalysisOptions = {
  llm?: import("@/engine/llm/provider").LLMProvider;
  fetchPubmed?: (topic: string) => Promise<PubMedSummary | null>;
};

export type RunAnalysisMeta = {
  persisted_analysis_id: string | null;
};

export async function runAnalysisWithMeta(
  input: AnalyzeInput,
  options?: RunAnalysisOptions
): Promise<{ result: AnalyzeResponse; meta: RunAnalysisMeta }> {
  const result = await analyze(input, options);

  if (!isPersistenceFlagEnabled()) {
    return { result, meta: { persisted_analysis_id: null } };
  }

  if (!hasSupabasePersistenceConfig()) {
    console.warn(
      "[EIE] persistence: skipped — EIE_PERSIST_ANALYSIS is set but NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing"
    );
    return { result, meta: { persisted_analysis_id: null } };
  }

  try {
    const client = createSupabaseAdmin();
    const analysisId = await persistCompletedAnalysis(client, input, result);
    console.info(`[EIE] persistence: stored analysis_id=${analysisId}`);
    if (isAnimocaTaskEnqueueEnabled()) {
      if (result.evidence_flags.length > 0) {
        console.info("[EIE] animoca_tasks: scheduling review_flagged_analysis (non-blocking)");
      }
      void enqueueAnimocaTasksAfterPersist(client, analysisId, result).catch((animocaErr) => {
        console.error("[EIE] animoca_tasks enqueue failed (non-fatal):", animocaErr);
      });
    }

    if (isAnimocaEmailAutoSendEnabled()) {
      // Off by default. Fire-and-forget and non-fatal; only for analyses that likely require review.
      if (result.evidence_flags.length > 0) {
        void (async () => {
          try {
            const brief = await buildAnalystBrief(analysisId, client);
            if (!brief) {
              console.warn(
                `[EIE] animoca_email: auto-send skipped (brief missing) analysis_id=${analysisId}`
              );
              return;
            }
            const email = formatAnimocaEmailBrief({ brief });
            console.info(
              `[EIE] animoca_email: auto-send attempted analysis_id=${analysisId} to=${email.to}`
            );
            const sendRes = await sendEmailViaResend({
              to: email.to,
              subject: email.subject,
              text: email.body_text,
            });
            if (sendRes.status === "success") {
              console.info(
                `[EIE] animoca_email: auto-send succeeded id=${sendRes.id ?? "(unknown)"}`
              );
            } else if (sendRes.status === "missing_email_config") {
              console.warn(
                `[EIE] animoca_email: auto-send skipped (missing config: ${sendRes.reason})`
              );
            } else {
              console.error(`[EIE] animoca_email: auto-send failed (${sendRes.reason})`);
            }
          } catch (autoErr) {
            console.error("[EIE] animoca_email: auto-send failed (non-fatal):", autoErr);
          }
        })();
      }
    }

    return { result, meta: { persisted_analysis_id: analysisId } };
  } catch (err) {
    console.error("[EIE] persistence: persist failed:", err);
    return { result, meta: { persisted_analysis_id: null } };
  }
}

export async function runAnalysis(
  input: AnalyzeInput,
  options?: RunAnalysisOptions
): Promise<AnalyzeResponse> {
  const { result } = await runAnalysisWithMeta(input, options);
  return result;
}
