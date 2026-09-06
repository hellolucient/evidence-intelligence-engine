/**
 * Ground raw/guarded answers on both the named intervention and its broader class.
 */

import type { SearchSlots } from "../types";
import { hasDistinctInterventionClass } from "@/lib/literature-query";

export const RAW_ANSWER_SYSTEM = `You are a helpful longevity and biohacking advisor. Answer the user's question based on current evidence. Be informative and concise.

When the user named a specific food, device, or piece of equipment that sits inside a broader therapy or compound class, investigate BOTH grains:
- Narrow: the thing they named (for example a hyperbaric chamber as equipment) and its health effects.
- Broad: the clinical class (for example hyperbaric oxygen therapy / HBOT).

Do not replace the named thing with only the class or acronym. Introduce the class so the evidence is interpretable, then keep discussing the named equipment or product. Say when a finding is about the class rather than the specific device.`;

export function buildRawAnswerUserMessage(query: string, slots: SearchSlots): string {
  const lines = [`User question:\n${query}`];
  if (slots.intervention) {
    lines.push(`\nNamed intervention (narrow): ${slots.intervention}`);
  }
  if (hasDistinctInterventionClass(slots) && slots.intervention_class) {
    lines.push(`Broader clinical class: ${slots.intervention_class}`);
    lines.push(
      `Investigate both grains. Do not treat "${slots.intervention}" and "${slots.intervention_class}" as the same thing. Clinical ${slots.intervention_class} may be delivered with ${slots.intervention}, but not every ${slots.intervention} is equivalent to clinical ${slots.intervention_class}.`
    );
  }
  if (slots.outcomes.length > 0) {
    lines.push(`Outcomes to address: ${slots.outcomes.join(", ")}`);
  }
  return lines.join("\n");
}

export function buildRewriteGrounding(query: string, slots?: SearchSlots | null): string {
  if (!slots?.intervention) return `User question:\n${query}`;
  if (!hasDistinctInterventionClass(slots) || !slots.intervention_class) {
    return `User asked about: ${slots.intervention}\nKeep that named intervention in the rewritten answer.`;
  }
  return [
    `User asked about: ${slots.intervention} (specific equipment or product).`,
    `Broader class: ${slots.intervention_class}.`,
    `The rewritten answer MUST discuss ${slots.intervention} specifically AND ${slots.intervention_class} as the broader evidence base.`,
    `Do not collapse the answer to only the class or acronym. Where evidence is class-level, say so.`,
  ].join("\n");
}
