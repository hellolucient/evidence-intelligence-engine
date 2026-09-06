/**
 * User-facing findings: plain English about the input and evidence split.
 * Not scoring flags. Causal-wording flags stay internal for the guarded rewrite.
 */

import type { LiteratureSummary, SearchSlots } from "../types";
import { hasDistinctInterventionClass } from "@/lib/literature-query";

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

  if (slots && hasDistinctInterventionClass(slots) && slots.intervention_class) {
    findings.push(
      `The input names "${slots.intervention}" specifically. Broader evidence is about "${slots.intervention_class}". Trials of the class are related, not automatic proof about this equipment or product form.`
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
