/**
 * Parse a user question into literature search slots (intervention / outcome).
 * LLM first, heuristic fallback so PubMed never searches raw marketing copy.
 */

import type { QueryFrame, SearchSlots } from "../types";
import type { ModelRouter } from "../llm/model-router";
import { PROMPT_VERSION } from "../prompts/registry";
import { parseLlmJson } from "./llm-json";
import { challengeParse } from "./parse-critic";
import { finalizeSearchSlots } from "./parse-protocol";
import {
  heuristicSearchSlots,
  resolveInterventionClass,
  sanitizeIntervention,
} from "@/lib/literature-query";

const PARSE_SYSTEM = `You extract literature-search slots from a user message about health, longevity, or biohacking.

Ignore sales language (try our, guaranteed, buy now). Keep the named equipment or product as the intervention when the user named one (chamber, bed, device, a specific tea). Also name the broader therapy or compound class when it is different.

Rules:
- intervention: what the user named, e.g. "hyperbaric chamber", "jasmine tea", "red light therapy bed" → "red light therapy". Not the whole slogan.
- intervention_class: broader clinical class when distinct, e.g. hyperbaric chamber → "hyperbaric oxygen therapy"; jasmine tea → "green tea". Empty string if the named thing IS the class (metformin).
- outcomes: specific measurable effects only, e.g. sleep, melatonin, anxiety, lifespan. Empty array if the pitch is only "feel better" / "wellbeing".
- Do not put the intervention's own words (therapy, light, tea, chamber) in outcomes.
- Do not use melatonin/caffeine as the intervention when they are the claimed effect of something else (e.g. red light → melatonin).
- frame: "marketing" if it reads like ad copy; "question" if it is a question; "claim" otherwise.
- population: optional (older adults, athletes). Empty string if unknown.

Output ONLY a JSON object:
{"intervention":"","intervention_class":"","outcomes":[],"population":"","frame":"question"}`;

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

  const parsedClass = sanitizeIntervention(String(record.intervention_class ?? ""));
  const intervention_class =
    parsedClass && parsedClass.toLowerCase() !== intervention.toLowerCase()
      ? parsedClass
      : resolveInterventionClass(intervention);

  return {
    intervention,
    intervention_class,
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
  const intervention_class =
    llm.intervention_class || fallback.intervention_class || resolveInterventionClass(intervention);

  return {
    intervention,
    intervention_class,
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
  const fallback = finalizeSearchSlots(query, heuristicSearchSlots(query));

  try {
    const out = await router.complete({
      taskType: "query_parse",
      promptVersion: PROMPT_VERSION.query_parse,
      systemPrompt: PARSE_SYSTEM,
      userMessage: `User message:\n${query}`,
    });
    const parsed = slotsFromUnknown(parseLlmJson(out));
    const merged = finalizeSearchSlots(query, mergeSlots(parsed, fallback));
    const challenged = await challengeParse(query, merged, router);
    console.info(
      `[EIE] query parse intervention="${challenged.intervention}" class="${challenged.intervention_class ?? ""}" kind="${challenged.object_kind ?? ""}" verdict="${challenged.critic_verdict ?? ""}" outcomes=${JSON.stringify(challenged.outcomes)} frame=${challenged.frame}`
    );
    return challenged;
  } catch (err) {
    console.error("[EIE] query parse failed, using heuristic slots:", err);
    return fallback;
  }
}
