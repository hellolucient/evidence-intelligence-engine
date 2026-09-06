/**
 * One challenger pass on the parse (max two revisions). Cannot override noun lock.
 */

import type { ObjectKind, SearchSlots } from "../types";
import type { ModelRouter } from "../llm/model-router";
import { PROMPT_VERSION } from "../prompts/registry";
import { parseLlmJson } from "./llm-json";
import { finalizeSearchSlots } from "./parse-protocol";
import { resolveInterventionClass, sanitizeIntervention } from "@/lib/literature-query";

export const CRITIC_MAX_ROUNDS = 2;

const CRITIC_SYSTEM = `You challenge a literature-search parse of a health or longevity user message.

The parse must keep the thing the user NAMED (equipment, food, product form). You may ADD a broader clinical class. You must not REPLACE the named object with the class or an acronym.

Protected nouns are listed in the user message. Every protected noun must remain inside "intervention".

If the named object is equipment that is not identical to the clinical protocol (e.g. hyperbaric chamber vs HBOT; mild consumer chamber vs medical ~2 ATA 100% oxygen), set clarifying_question to one concrete question. Otherwise use an empty string.

Verdict:
- "accept" if the parse already keeps the named object and a class when one exists
- "revise" if intervention dropped the named object, outcomes are wrong, or a distinct class is missing

Output ONLY JSON:
{"verdict":"accept","intervention":"","intervention_class":"","outcomes":[],"object_kind":"equipment","clarifying_question":"","challenge":""}`;

function asObjectKind(value: unknown): ObjectKind | undefined {
  if (
    value === "equipment" ||
    value === "food" ||
    value === "substance" ||
    value === "protocol" ||
    value === "class" ||
    value === "other"
  ) {
    return value;
  }
  return undefined;
}

function criticSlotsFromUnknown(raw: unknown, current: SearchSlots): SearchSlots | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const intervention =
    sanitizeIntervention(String(record.intervention ?? "")) || current.intervention;
  if (!intervention) return null;
  const outcomes = Array.isArray(record.outcomes)
    ? record.outcomes
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : current.outcomes;
  const parsedClass = sanitizeIntervention(String(record.intervention_class ?? ""));
  const intervention_class =
    parsedClass && parsedClass.toLowerCase() !== intervention.toLowerCase()
      ? parsedClass
      : current.intervention_class || resolveInterventionClass(intervention);
  const clarifying =
    typeof record.clarifying_question === "string" ? record.clarifying_question.trim() : "";
  const challenge = typeof record.challenge === "string" ? record.challenge.trim() : "";
  return {
    ...current,
    intervention,
    intervention_class,
    outcomes,
    object_kind: asObjectKind(record.object_kind) || current.object_kind,
    clarifying_question: clarifying || current.clarifying_question,
    parse_challenge: challenge || current.parse_challenge,
    outcome_is_broad: outcomes.length === 0,
  };
}

export async function challengeParse(
  query: string,
  slots: SearchSlots,
  router: ModelRouter
): Promise<SearchSlots> {
  let current = finalizeSearchSlots(query, slots);

  for (let round = 0; round < CRITIC_MAX_ROUNDS; round += 1) {
    try {
      const out = await router.complete({
        taskType: "parse_critic",
        promptVersion: PROMPT_VERSION.parse_critic,
        systemPrompt: CRITIC_SYSTEM,
        userMessage: [
          `User message:\n${query}`,
          `Protected nouns (must stay in intervention): ${JSON.stringify(current.protected_nouns ?? [])}`,
          `Current parse:\n${JSON.stringify({
            intervention: current.intervention,
            intervention_class: current.intervention_class ?? "",
            outcomes: current.outcomes,
            object_kind: current.object_kind ?? "",
            frame: current.frame,
          })}`,
        ].join("\n\n"),
      });
      const raw = parseLlmJson(out);
      if (!raw || typeof raw !== "object") break;
      const record = raw as Record<string, unknown>;
      const verdict = record.verdict === "revise" ? "revise" : "accept";
      const next = criticSlotsFromUnknown(raw, current);
      if (!next) break;
      current = finalizeSearchSlots(query, {
        ...next,
        critic_verdict: verdict === "revise" ? "revise" : "accept",
      });
      if (verdict === "accept") break;
    } catch (err) {
      console.error("[EIE] parse critic failed:", err);
      break;
    }
  }

  return finalizeSearchSlots(query, current);
}
