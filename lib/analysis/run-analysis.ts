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
  isPersistenceFlagEnabled,
} from "@/lib/persistence/persist-config";

export type RunAnalysisOptions = {
  llm?: import("@/engine/llm/provider").LLMProvider;
  fetchPubmed?: (topic: string) => Promise<PubMedSummary | null>;
};

export async function runAnalysis(
  input: AnalyzeInput,
  options?: RunAnalysisOptions
): Promise<AnalyzeResponse> {
  const result = await analyze(input, options);

  if (!isPersistenceFlagEnabled()) {
    return result;
  }

  if (!hasSupabasePersistenceConfig()) {
    console.warn(
      "[EIE] EIE_PERSIST_ANALYSIS is enabled but Supabase env is missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY); skipping persistence."
    );
    return result;
  }

  try {
    const client = createSupabaseAdmin();
    await persistCompletedAnalysis(client, input, result);
  } catch (err) {
    console.error("[EIE] Persist failed:", err);
  }

  return result;
}
