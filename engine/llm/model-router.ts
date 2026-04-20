import type { PromptVersion } from "../prompts/registry";
import type { ModelTier, TaskType } from "./task-types";
import { DEFAULT_OPENAI_MODEL, DEFAULT_TEMPERATURE, completeOpenAIChat } from "./provider";
import type { LLMProvider } from "./provider";
import { logModelRunNonFatal } from "@/lib/model-runs/log-model-run";

export type ModelRunMeta = {
  tier_requested: ModelTier;
  tier_resolved: ModelTier;
  downgraded: boolean;
  downgrade_reason?: string;
  would_escalate_to?: ModelTier;
};

export type RoutedCompletionInput = {
  taskType: TaskType;
  promptVersion: PromptVersion;
  systemPrompt: string;
  userMessage: string;
  analysisId?: string | null;
  metadata?: Record<string, unknown>;
};

export type ModelRouter = {
  complete(input: RoutedCompletionInput): Promise<string>;
};

function defaultTierForTask(taskType: TaskType): ModelTier {
  switch (taskType) {
    case "raw_answer":
    case "claim_extraction":
    case "downstream_menu_description":
    case "downstream_product_description":
      return "cheap";
    case "rewrite":
      return "reasoning";
  }
}

function resolveOpenAIModelForTier(tier: ModelTier): string | null {
  // Explicit tier env vars are optional. If they are missing, we downgrade to cheap.
  if (tier === "cheap") {
    return process.env.EIE_OPENAI_MODEL_CHEAP?.trim() || DEFAULT_OPENAI_MODEL;
  }
  if (tier === "reasoning") {
    return process.env.EIE_OPENAI_MODEL_REASONING?.trim() || null;
  }
  return process.env.EIE_OPENAI_MODEL_PREMIUM?.trim() || null;
}

function chooseModel(taskType: TaskType): {
  provider: "openai";
  model: string;
  tier_requested: ModelTier;
  tier_resolved: ModelTier;
  downgraded: boolean;
  downgrade_reason?: string;
  would_escalate_to?: ModelTier;
} {
  const tier_requested = defaultTierForTask(taskType);

  // Phase 5: escalation is metadata-only unless the higher-tier model is configured.
  const escalationTarget: ModelTier | null = null;
  const would_escalate_to = escalationTarget ?? undefined;

  const configured = resolveOpenAIModelForTier(tier_requested);
  if (configured) {
    return {
      provider: "openai",
      model: configured,
      tier_requested,
      tier_resolved: tier_requested,
      downgraded: false,
      would_escalate_to,
    };
  }

  // Downgrade path: fall back to cheap/default model.
  const cheapModel = resolveOpenAIModelForTier("cheap") || DEFAULT_OPENAI_MODEL;
  return {
    provider: "openai",
    model: cheapModel,
    tier_requested,
    tier_resolved: "cheap",
    downgraded: true,
    downgrade_reason: `tier_model_unset:${tier_requested}`,
    would_escalate_to,
  };
}

export function createModelRouter(options?: { llm?: LLMProvider }): ModelRouter {
  const injected = options?.llm;

  return {
    async complete(input: RoutedCompletionInput): Promise<string> {
      const started = Date.now();
      const routed = chooseModel(input.taskType);

      const runBase = {
        analysis_id: input.analysisId ?? null,
        prompt_version: input.promptVersion,
        task_type: input.taskType,
        provider: routed.provider,
        model: routed.model,
        latency_ms: 0,
        status: "success" as const,
        error_message: null as string | null,
        metadata: {
          ...input.metadata,
          router: {
            tier_requested: routed.tier_requested,
            tier_resolved: routed.tier_resolved,
            downgraded: routed.downgraded,
            downgrade_reason: routed.downgrade_reason,
            would_escalate_to: routed.would_escalate_to,
          } satisfies ModelRunMeta,
        },
      };

      try {
        const content = injected
          ? await injected.complete(input.systemPrompt, input.userMessage)
          : await completeOpenAIChat({
              model: routed.model,
              systemPrompt: input.systemPrompt,
              userMessage: input.userMessage,
              temperature: DEFAULT_TEMPERATURE,
            });

        const latency_ms = Date.now() - started;
        await logModelRunNonFatal({
          ...runBase,
          latency_ms,
          status: "success",
          error_message: null,
        });

        return content;
      } catch (err) {
        const latency_ms = Date.now() - started;
        const error_message = err instanceof Error ? err.message : String(err);
        await logModelRunNonFatal({
          ...runBase,
          latency_ms,
          status: "failure",
          error_message,
        });
        throw err;
      }
    },
  };
}

