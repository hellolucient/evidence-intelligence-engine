/**
 * User-facing findings: the takeaway about the input and evidence.
 * Causal-wording flags stay internal for the guarded rewrite.
 */

import type { LiteratureSummary, SearchSlots } from "../types";
import { hasDistinctInterventionClass, isFolkProtocol } from "@/lib/literature-query";

const OUTCOME_LEAD_VERBS =
  /^(improve|improves|improving|increase|increases|increasing|reduce|reduces|reducing|boost|boosts|promote|promotes|help|helps|support|supports)\s+/i;

export function formatOutcomeForProse(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ").replace(OUTCOME_LEAD_VERBS, "").trim();
  return cleaned || "the claimed outcome";
}

function primaryOutcome(slots: SearchSlots): string {
  return formatOutcomeForProse(slots.outcomes[0] || "the claimed outcome");
}

function isHyperbaricEquipment(slots: SearchSlots): boolean {
  const haystack = `${slots.intervention} ${slots.intervention_class ?? ""}`.toLowerCase();
  const namesChamber = haystack.includes("chamber") || slots.object_kind === "equipment";
  return namesChamber && /\b(hyperbaric|hbot)\b/.test(haystack);
}

export function buildUserFindings(input: {
  slots?: SearchSlots | null;
  literature?: LiteratureSummary | null;
  claimsCount?: number;
}): string[] {
  const takeaway: string[] = [];
  const context: string[] = [];
  const { slots, literature, claimsCount = 0 } = input;

  if (slots?.frame === "question" && claimsCount > 0) {
    context.push(
      "The input was a question, not a claim. Claims were inferred from the generated answer, not from PubMed."
    );
  } else if (slots?.frame === "marketing" && claimsCount > 0) {
    context.push(
      "The input reads like product copy. Claims were inferred from the copy, not from PubMed."
    );
  }

  if (slots && isFolkProtocol(slots)) {
    const protocol = slots.intervention;
    const outcome = primaryOutcome(slots);
    const protocolPapers = literature?.protocol_paper_count ?? literature?.linked_papers_count ?? 0;
    if (literature && literature.pubmed_rct_pool === 0) {
      takeaway.push(
        `There is almost no evidence that a ${protocol} of any kind improves ${outcome}.`
      );
    }
    if (protocolPapers > 0) {
      takeaway.push(
        `The papers below discuss ${protocol} in general — including claimed benefits, harms, and whether the practice is evidence-based — not this ${outcome} claim specifically.`
      );
    }
    if (slots.recipe_ingredients && slots.recipe_ingredients.length > 0) {
      takeaway.push(
        `Ingredients named in the recipe (${slots.recipe_ingredients.join(", ")}) are not counted as proof that a ${protocol} works.`
      );
    }
    return [...takeaway, ...context];
  }

  if (slots && hasDistinctInterventionClass(slots) && slots.intervention_class) {
    takeaway.push(
      `The input names "${slots.intervention}" specifically. Broader evidence is about "${slots.intervention_class}". Trials of the class are related, not automatic proof about this equipment or product form.`
    );
  }

  if (slots && isHyperbaricEquipment(slots)) {
    takeaway.push(
      "A medical hyperbaric oxygen chamber (typically about 2 atmospheres of 100% oxygen) is not the same device as a mild consumer chamber. Most published trials are about the medical protocol."
    );
  }

  if (
    literature &&
    typeof literature.specific_rct_count === "number" &&
    literature.pubmed_rct_pool > literature.specific_rct_count
  ) {
    takeaway.push(
      `Most linked trials are at the class level (${literature.pubmed_rct_pool} PubMed RCTs) rather than the named object (${literature.specific_rct_count} PubMed RCTs).`
    );
  }

  return [...takeaway, ...context];
}
