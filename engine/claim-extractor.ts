/**
 * Extract structured claims from raw LLM output using a second LLM call.
 */

import type { ExtractedClaim } from "./types";
import type { LLMProvider } from "./llm/provider";

const EXTRACTION_SYSTEM = `You are a claim extractor for longevity and health content.
Given a raw text response, extract every discrete factual claim.
For each claim output:
- claim_text: exact or close paraphrase of the claim
- claim_type: one of mechanistic | biomarker | lifespan_outcome | healthspan_outcome | intervention_effect | other
- detected_certainty_level: one of strong | moderate | speculative (infer from wording: "proven", "extends lifespan" -> strong; "may", "suggests" -> moderate; "could", "might" -> speculative)

Output ONLY a valid JSON array of objects with keys claim_text, claim_type, detected_certainty_level. No markdown, no explanation.`;

export async function extractClaims(
  rawResponse: string,
  llm: LLMProvider
): Promise<ExtractedClaim[]> {
  const userMessage = `Extract all factual claims from this response as a JSON array:\n\n${rawResponse}`;
  const out = await llm.complete(EXTRACTION_SYSTEM, userMessage);
  const trimmed = out.replace(/^```json?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const claims: ExtractedClaim[] = [];
  const validTypes = ["mechanistic", "biomarker", "lifespan_outcome", "healthspan_outcome", "intervention_effect", "other"];
  const validCertainty = ["strong", "moderate", "speculative"];
  for (const item of parsed) {
    if (item && typeof item === "object" && "claim_text" in item && typeof (item as Record<string, unknown>).claim_text === "string") {
      const raw = item as Record<string, unknown>;
      const claim_type = validTypes.includes((raw.claim_type as string) ?? "") ? (raw.claim_type as ExtractedClaim["claim_type"]) : "other";
      const detected_certainty_level = validCertainty.includes((raw.detected_certainty_level as string) ?? "") ? (raw.detected_certainty_level as ExtractedClaim["detected_certainty_level"]) : "moderate";
      claims.push({
        claim_text: String(raw.claim_text),
        claim_type,
        detected_certainty_level,
      });
    }
  }
  return claims;
}
