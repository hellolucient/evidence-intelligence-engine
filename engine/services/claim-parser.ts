/**
 * Claim parser: extract structured claims from a raw model answer.
 */

import type { ExtractedClaim, InterventionGrain, SearchSlots } from "../types";
import type { ModelRouter } from "../llm/model-router";
import { PROMPT_VERSION } from "../prompts/registry";
import { parseLlmJson } from "./llm-json";
import { isSpecificOutcome, sanitizeIntervention } from "@/lib/literature-query";

const EXTRACTION_SYSTEM = `You are a claim extractor for longevity and health content.
Given a raw text response, extract every discrete factual claim.
For each claim output:
- claim_text: exact or close paraphrase of the claim. Use the user's named intervention (e.g. "hyperbaric chamber") in the sentence when the claim is about that equipment/product. Use the clinical class name (e.g. "hyperbaric oxygen therapy" / HBOT) when the claim is about the broader therapy.
- claim_type: one of mechanistic | biomarker | lifespan_outcome | healthspan_outcome | intervention_effect | other
- detected_certainty_level: one of strong | moderate | speculative (infer from wording: "proven", "extends lifespan" -> strong; "may", "suggests" -> moderate; "could", "might" -> speculative)
- intervention: the treatment/food/practice/equipment this claim is about (short canonical name)
- outcome: the specific effect (sleep, melatonin, lifespan, inflammation). Empty string if only vague wellbeing.
- grain: "specific" if the claim is about the named equipment or product form; "class" if it is about the broader therapy or compound class.

When the user named equipment (a chamber, bed, device) that delivers a therapy class (HBOT, photobiomodulation), extract claims at BOTH grains when the source text allows. Do not drop the specific grain just because the prose also used the clinical acronym.

Do not use a downstream biomarker as the intervention when it is the claimed effect (red light → melatonin: intervention is red light therapy, outcome is melatonin).

Output ONLY a valid JSON array of objects. No markdown, no explanation.`;

function asGrain(value: unknown): InterventionGrain | undefined {
  if (value === "specific" || value === "class") return value;
  return undefined;
}

function fillClaimSlots(claim: ExtractedClaim, topic?: SearchSlots | null): ExtractedClaim {
  const grain = claim.grain;
  const intervention =
    grain === "class"
      ? sanitizeIntervention(claim.intervention ?? "") ||
        topic?.intervention_class ||
        topic?.intervention ||
        undefined
      : sanitizeIntervention(claim.intervention ?? "") || topic?.intervention || undefined;
  const rawOutcome = (claim.outcome ?? "").trim().toLowerCase();
  const outcome = rawOutcome && isSpecificOutcome(rawOutcome)
    ? rawOutcome
    : topic?.outcomes[0];

  return {
    ...claim,
    intervention,
    outcome,
    grain,
  };
}

export async function extractClaims(
  rawResponse: string,
  router: ModelRouter,
  topicSlots?: SearchSlots | null
): Promise<ExtractedClaim[]> {
  const topicHint = topicSlots?.intervention
    ? `\n\nThe user question was parsed as intervention="${topicSlots.intervention}"${
        topicSlots.intervention_class
          ? ` intervention_class="${topicSlots.intervention_class}"`
          : ""
      } outcomes=${JSON.stringify(topicSlots.outcomes)}. Tag grain=specific for the named thing and grain=class for the broader therapy when both appear. Reuse that intervention unless a claim is clearly about something else.`
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
            grain: asGrain(raw.grain),
          },
          topicSlots
        )
      );
    }
  }
  return claims;
}
