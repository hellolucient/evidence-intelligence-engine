/**
 * User-facing findings: plain English about the input and evidence split.
 * Not scoring flags. Causal-wording flags stay internal for the guarded rewrite.
 */

import type { LiteratureSummary, SearchSlots } from "../types";
import { hasDistinctInterventionClass, isFolkProtocol } from "@/lib/literature-query";

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
  const findings: string[] = [];
  const { slots, literature, claimsCount = 0 } = input;

  if (slots?.frame === "question" && claimsCount > 0) {
    findings.push(
      "The input was a question, not a claim. Claims were inferred from the generated answer, not from PubMed."
    );
  } else if (slots?.frame === "marketing" && claimsCount > 0) {
    findings.push(
      "The input reads like product copy. Claims were inferred from the copy, not from PubMed."
    );
  }

  if (slots && isFolkProtocol(slots)) {
    const protocol = slots.intervention;
    const outcome = slots.outcomes[0] || "the claimed outcome";
    const protocolPapers = literature?.protocol_paper_count ?? literature?.linked_papers_count ?? 0;
    if (literature && literature.pubmed_rct_pool === 0) {
      findings.push(
        `There is almost no evidence that a ${protocol} of any kind improves ${outcome}.`
      );
    }
    if (protocolPapers > 0) {
      findings.push(
        `The papers below discuss ${protocol} in general — including claimed benefits, harms, and whether the practice is evidence-based — not this ${outcome} claim specifically.`
      );
    }
    if (slots.recipe_ingredients && slots.recipe_ingredients.length > 0) {
      findings.push(
        `Ingredients named in the recipe (${slots.recipe_ingredients.join(", ")}) are not counted as proof that a ${protocol} works.`
      );
    }
    return findings;
  }

  if (slots && hasDistinctInterventionClass(slots) && slots.intervention_class) {
    findings.push(
      `The input names "${slots.intervention}" specifically. Broader evidence is about "${slots.intervention_class}". Trials of the class are related, not automatic proof about this equipment or product form.`
    );
  }

  if (slots && isHyperbaricEquipment(slots)) {
    findings.push(
      "A medical hyperbaric oxygen chamber (typically about 2 atmospheres of 100% oxygen) is not the same device as a mild consumer chamber. Most published trials are about the medical protocol."
    );
  }

  if (
    literature &&
    typeof literature.specific_rct_count === "number" &&
    literature.pubmed_rct_pool > literature.specific_rct_count
  ) {
    findings.push(
      `Most linked trials are at the class level (${literature.pubmed_rct_pool} PubMed RCTs) rather than the named object (${literature.specific_rct_count} PubMed RCTs).`
    );
  }

  return findings;
}
