/**
 * Bounded parse protocol: named object vs class, protected nouns, clarifying forks.
 * Deterministic rules live here so a critic LLM cannot drop what the user named.
 */

import type { ObjectKind, SearchSlots } from "../types";
import {
  extractPrimarySubject,
  hasDistinctInterventionClass,
  normalizeQueryText,
  resolveInterventionClass,
  sanitizeIntervention,
} from "@/lib/literature-query";

export const EQUIPMENT_TOKENS = new Set([
  "chamber",
  "cabin",
  "bed",
  "mask",
  "panel",
  "lamp",
  "machine",
]);

const FORM_TOKENS = new Set(["tea", "oil", "extract"]);

const MILD_VS_MEDICAL_PATTERN = /\b(hyperbaric|hbot)\b/i;

export function tokenizeQuery(text: string): string[] {
  return normalizeQueryText(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^\w]/g, ""))
    .filter((word) => word.length >= 2);
}

/** Nouns in the user text that must remain on the named intervention. */
export function extractProtectedNouns(query: string): string[] {
  const tokens = new Set<string>();
  const subject = extractPrimarySubject(query);
  for (const word of tokenizeQuery(subject)) {
    if (word.length >= 4 || FORM_TOKENS.has(word) || EQUIPMENT_TOKENS.has(word)) {
      tokens.add(word);
    }
  }
  for (const word of tokenizeQuery(query)) {
    if (word === "chamber" || word === "cabin") tokens.add(word);
    if (FORM_TOKENS.has(word)) tokens.add(word);
  }
  return [...tokens];
}

export function inferObjectKind(query: string, intervention: string): ObjectKind {
  const haystack = `${query} ${intervention}`.toLowerCase();
  if ([...EQUIPMENT_TOKENS].some((token) => haystack.includes(token))) return "equipment";
  if ([...FORM_TOKENS].some((token) => haystack.includes(token))) return "food";
  if (/\b(fast|fasting|diet|protocol|training|workout)\b/i.test(haystack)) return "protocol";
  return "substance";
}

export function clarifyingQuestionFor(query: string, slots: SearchSlots): string | undefined {
  const kind = slots.object_kind || inferObjectKind(query, slots.intervention);
  if (kind !== "equipment") return undefined;
  if (!MILD_VS_MEDICAL_PATTERN.test(`${query} ${slots.intervention} ${slots.intervention_class ?? ""}`)) {
    return undefined;
  }
  return "Did you mean a medical hyperbaric oxygen chamber (typically ~2 ATA, 100% oxygen) or a mild consumer hyperbaric chamber? That split changes which trials count as evidence.";
}

export function missingProtectedNouns(intervention: string, nouns: string[]): string[] {
  const haystack = intervention.toLowerCase();
  return nouns.filter((noun) => !haystack.includes(noun.toLowerCase()));
}

/**
 * Restore any protected noun a parser/critic dropped from the named intervention.
 * The clinical class may still be added; the named object cannot be replaced by it.
 */
export function enforceProtectedNouns(query: string, slots: SearchSlots): SearchSlots {
  const protectedNouns = extractProtectedNouns(query);
  const missing = missingProtectedNouns(slots.intervention, protectedNouns);
  let intervention = slots.intervention;
  let verdict = slots.critic_verdict;

  if (missing.length > 0) {
    const named = extractPrimarySubject(query);
    intervention = sanitizeIntervention(named) || `${intervention} ${missing.join(" ")}`.trim();
    verdict = "enforced";
  }

  const object_kind = slots.object_kind || inferObjectKind(query, intervention);
  const intervention_class =
    slots.intervention_class || resolveInterventionClass(intervention);
  const next: SearchSlots = {
    ...slots,
    intervention,
    intervention_class,
    object_kind,
    protected_nouns: protectedNouns,
    critic_verdict: verdict,
    outcome_is_broad: slots.outcomes.length === 0,
  };
  next.clarifying_question =
    slots.clarifying_question?.trim() || clarifyingQuestionFor(query, next);
  return next;
}

export function finalizeSearchSlots(query: string, slots: SearchSlots): SearchSlots {
  return enforceProtectedNouns(query, slots);
}

/** True when the prose still names the user's object, not only the clinical class. */
export function proseCoversNamedObject(text: string, intervention: string): boolean {
  if (!intervention.trim() || !text.trim()) return false;
  const tokens = tokenizeQuery(intervention).filter(
    (word) => word.length >= 4 || EQUIPMENT_TOKENS.has(word) || FORM_TOKENS.has(word)
  );
  if (tokens.length === 0) return true;
  const lower = text.toLowerCase();
  return tokens.every((token) => lower.includes(token));
}

export function shouldSearchBothGrains(slots: SearchSlots): boolean {
  return hasDistinctInterventionClass(slots);
}
