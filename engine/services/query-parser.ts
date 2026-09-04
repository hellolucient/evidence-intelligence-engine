/**
 * Parse a user question into literature search slots (intervention / outcome).
 * LLM first, heuristic fallback so PubMed never searches raw marketing copy.
 */

import type { QueryFrame, SearchSlots } from "../types";
import type { ModelRouter } from "../llm/model-router";
import { PROMPT_VERSION } from "../prompts/registry";
import { parseLlmJson } from "./llm-json";
import { heuristicSearchSlots, sanitizeIntervention } from "@/lib/literature-query";

const PARSE_SYSTEM = `You extract literature-search slots from a user message about health, longevity, or biohacking.

Ignore sales language (try our, guaranteed, buy now, product beds/devices as the thing itself).
Identify the actual intervention (treatment, food, drug, practice) and specific health outcomes.

Rules:
- intervention: short canonical name, e.g. "red light therapy", "jasmine tea", "metformin". Not the whole slogan.
- outcomes: specific measurable effects only, e.g. sleep, melatonin, anxiety, lifespan. Empty array if the pitch is only "feel better" / "wellbeing".
- Do not put the intervention's own words (therapy, light, tea) in outcomes.
- Do not use melatonin/caffeine as the intervention when they are the claimed effect of something else (e.g. red light → melatonin).
- frame: "marketing" if it reads like ad copy; "question" if it is a question; "claim" otherwise.
- population: optional (older adults, athletes). Empty string if unknown.

Output ONLY a JSON object:
{"intervention":"","outcomes":[],"population":"","frame":"question"}`;

function asFrame(value: unknown): QueryFrame {
  if (value === "marketing" || value === "question" || value === "claim") return value;
  return "claim";
}

function slotsFromUnknown(raw: unknown): SearchSlots | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const intervention = sanitizeIntervention(String(record.intervention ?? ""));
  if (!intervention) return null;

  const outcomes = Array.isArray(record.outcomes)
    ? record.outcomes
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const population =
    typeof record.population === "string" && record.population.trim()
      ? record.population.trim()
      : undefined;

  return {
    intervention,
    outcomes,
    population,
    frame: asFrame(record.frame),
    outcome_is_broad: outcomes.length === 0,
  };
}

function mergeSlots(llm: SearchSlots | null, fallback: SearchSlots): SearchSlots {
  if (!llm) return fallback;

  const intervention = llm.intervention || fallback.intervention;
  const outcomes = llm.outcomes.length > 0 ? llm.outcomes : fallback.outcomes;

  return {
    intervention,
    outcomes,
    population: llm.population || fallback.population,
    frame: llm.frame === "claim" && fallback.frame === "marketing" ? "marketing" : llm.frame,
    outcome_is_broad: outcomes.length === 0,
  };
}

export async function parseSearchSlots(
  query: string,
  router: ModelRouter
): Promise<SearchSlots> {
  const fallback = heuristicSearchSlots(query);

  try {
    const out = await router.complete({
      taskType: "query_parse",
      promptVersion: PROMPT_VERSION.query_parse,
      systemPrompt: PARSE_SYSTEM,
      userMessage: `User message:\n${query}`,
    });
    const parsed = slotsFromUnknown(parseLlmJson(out));
    const merged = mergeSlots(parsed, fallback);
    console.info(
      `[EIE] query parse intervention="${merged.intervention}" outcomes=${JSON.stringify(merged.outcomes)} frame=${merged.frame} broad=${merged.outcome_is_broad}`
    );
    return merged;
  } catch (err) {
    console.error("[EIE] query parse failed, using heuristic slots:", err);
    return fallback;
  }
}
