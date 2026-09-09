/**
 * One prose check: if the answer dropped the named object, rewrite once.
 */

import type { SearchSlots } from "../types";
import type { ModelRouter } from "../llm/model-router";
import { PROMPT_VERSION } from "../prompts/registry";
import { proseCoversNamedObject } from "./parse-protocol";

const REPAIR_SYSTEM = `You repair a longevity answer that dropped the user's named object.

Keep the facts and caution. Reintroduce the named equipment or product in the opening and when discussing health effects. You may also name the clinical class (e.g. HBOT) and must say when evidence is about the class rather than the named object.

Output ONLY the repaired answer. No preamble.`;

export async function ensureNamedObjectInProse(
  query: string,
  slots: SearchSlots,
  rawResponse: string,
  router: ModelRouter
): Promise<{ text: string; repaired: boolean }> {
  if (proseCoversNamedObject(rawResponse, slots.intervention)) {
    return { text: rawResponse, repaired: false };
  }

  try {
    const text = await router.complete({
      taskType: "prose_repair",
      promptVersion: PROMPT_VERSION.prose_repair,
      systemPrompt: REPAIR_SYSTEM,
      userMessage: [
        `User question:\n${query}`,
        `Named object that must appear: ${slots.intervention}`,
        slots.intervention_class ? `Broader class: ${slots.intervention_class}` : "",
        `Answer to repair:\n${rawResponse}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    const repaired = text.trim() || rawResponse;
    return { text: repaired, repaired: true };
  } catch (err) {
    console.error("[EIE] prose repair failed:", err);
    return { text: rawResponse, repaired: false };
  }
}
