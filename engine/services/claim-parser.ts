/**
 * Claim parser: extract structured claims from a raw model answer.
 */

import type { ExtractedClaim, SearchSlots } from "../types";
import type { ModelRouter } from "../llm/model-router";
import { PROMPT_VERSION } from "../prompts/registry";
import { parseLlmJson } from "./llm-json";
import { isSpecificOutcome, sanitizeIntervention } from "@/lib/literature-query";

const EXTRACTION_SYSTEM = `You are a claim extractor for longevity and health content.
Given a raw text response, extract every discrete factual claim.
For each claim output:
- claim_text: exact or close paraphrase of the claim
- claim_type: one of mechanistic | biomarker | lifespan_outcome | healthspan_outcome | intervention_effect | other
- detected_certainty_level: one of strong | moderate | speculative (infer from wording: "proven", "extends lifespan" -> strong; "may", "suggests" -> moderate; "could", "might" -> speculative)
- intervention: the treatment/food/practice this claim is about (short canonical name)
- outcome: the specific effect (sleep, melatonin, lifespan, inflammation). Empty string if only vague wellbeing.

Do not use a downstream biomarker as the intervention when it is the claimed effect (red light → melatonin: intervention is red light therapy, outcome is melatonin).

Output ONLY a valid JSON array of objects. No markdown, no explanation.`;

function fillClaimSlots(claim: ExtractedClaim, topic?: SearchSlots | null): ExtractedClaim {
  const intervention =
    sanitizeIntervention(claim.intervention ?? "") || topic?.intervention || undefined;
  const rawOutcome = (claim.outcome ?? "").trim().toLowerCase();
  const outcome = rawOutcome && isSpecificOutcome(rawOutcome)
    ? rawOutcome
    : topic?.outcomes[0];

  return {
    ...claim,
    intervention,
    outcome,
  };
}

export async function extractClaims(
  rawResponse: string,
  router: ModelRouter,
  topicSlots?: SearchSlots | null
): Promise<ExtractedClaim[]> {
  const topicHint = topicSlots?.intervention
    ? `\n\nThe user question was parsed as intervention="${topicSlots.intervention}" outcomes=${JSON.stringify(topicSlots.outcomes)}. Reuse that intervention unless a claim is clearly about something else.`
    : "";
  const userMessage = `Extract all factual claims from this response as a JSON array:${topicHint}\n\n${rawResponse}`;
  const out = await router.complete({
    taskType: "claim_extraction",
    promptVersion: PROMPT_VERSION.claim_extraction,
    systemPrompt: EXTRACTION_SYSTEM,
    userMessage,
  });
  let parsed = parseLlmJson(out);
  if (parsed == null) {
    const trimmed = out
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const claims: ExtractedClaim[] = [];
  const validTypes = [
    "mechanistic",
    "biomarker",
    "lifespan_outcome",
    "healthspan_outcome",
    "intervention_effect",
    "other",
  ];
  const validCertainty = ["strong", "moderate", "speculative"];
  for (const item of parsed) {
    if (
      item &&
      typeof item === "object" &&
      "claim_text" in item &&
      typeof (item as Record<string, unknown>).claim_text === "string"
    ) {
      const raw = item as Record<string, unknown>;
      const claim_type = validTypes.includes((raw.claim_type as string) ?? "")
        ? (raw.claim_type as ExtractedClaim["claim_type"])
        : "other";
      const detected_certainty_level = validCertainty.includes(
        (raw.detected_certainty_level as string) ?? ""
      )
        ? (raw.detected_certainty_level as ExtractedClaim["detected_certainty_level"])
        : "moderate";
      claims.push(
        fillClaimSlots(
          {
            claim_text: String(raw.claim_text),
            claim_type,
            detected_certainty_level,
            intervention:
              typeof raw.intervention === "string" ? raw.intervention : undefined,
            outcome: typeof raw.outcome === "string" ? raw.outcome : undefined,
          },
          topicSlots
        )
      );
    }
  }
  return claims;
}
