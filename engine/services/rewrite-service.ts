/**
 * Rewrite service: calibrate certainty and ordering to evidence strength.
 */

import type { ExtractedClaim, EvidenceFlag, EvidenceMapEntry } from "../types";
import type { ModelRouter } from "../llm/model-router";
import { PROMPT_VERSION } from "../prompts/registry";

/**
 * Calculate evidence strength score for a claim (higher = stronger evidence).
 */
function calculateEvidenceStrength(
  claim: ExtractedClaim,
  map: EvidenceMapEntry[]
): number {
  const intervention = map.find((e) =>
    claim.claim_text.toLowerCase().includes(e.intervention.toLowerCase())
  );

  if (!intervention) return 0;

  let score = 0;

  // Evidence label hierarchy (highest to lowest)
  const labelScores: Record<string, number> = {
    established: 100,
    supported: 80,
    promising: 60,
    emerging: 40,
    experimental: 20,
  };
  score += labelScores[intervention.evidence_label] || 0;

  // Human evidence bonus
  if (
    claim.claim_type === "healthspan_outcome" ||
    claim.claim_type === "lifespan_outcome"
  ) {
    const healthspanScores: Record<string, number> = {
      strong: 30,
      moderate: 20,
      limited: 10,
      none: 0,
    };
    score += healthspanScores[intervention.human_healthspan_evidence] || 0;

    if (claim.claim_type === "lifespan_outcome" && intervention.human_lifespan_evidence) {
      score += 40; // Human lifespan evidence is rare and valuable
    }
  }

  // RCT presence bonus
  const rctScores: Record<string, number> = {
    multiple_trials: 25,
    small_trials: 15,
    none: 0,
  };
  score += rctScores[intervention.rct_presence] || 0;

  // Meta-analysis bonus
  if (intervention.meta_analysis_presence) score += 20;

  // Consensus guideline bonus
  if (intervention.consensus_guideline) score += 15;

  // Penalty for animal-only evidence when claim is about human outcomes
  if (
    (claim.claim_type === "healthspan_outcome" ||
      claim.claim_type === "lifespan_outcome") &&
    intervention.human_healthspan_evidence === "none" &&
    !intervention.human_lifespan_evidence &&
    intervention.animal_lifespan_evidence !== "none"
  ) {
    score -= 30; // Animal evidence only, not human
  }

  return score;
}

function formatEvidenceContext(
  claims: ExtractedClaim[],
  flags: EvidenceFlag[],
  map: EvidenceMapEntry[]
): string {
  const lines: string[] = [];

  // Calculate evidence strength for each claim and create indexed array
  const claimsWithStrength = claims.map((c, idx) => ({
    claim: c,
    index: idx,
    strength: calculateEvidenceStrength(c, map),
    intervention: map.find((e) =>
      c.claim_text.toLowerCase().includes(e.intervention.toLowerCase())
    ),
  }));

  // Sort by evidence strength (highest first)
  claimsWithStrength.sort((a, b) => b.strength - a.strength);

  lines.push("=== EVIDENCE FLAGS DETECTED ===");
  if (flags.length === 0) {
    lines.push("No flags detected - evidence alignment is good.");
  } else {
    flags.forEach((f, idx) => {
      const claim = claims[f.claim_index];
      lines.push(`FLAG ${idx + 1}: [${f.type}] Penalty: -${f.penalty}`);
      lines.push(`  Claim: "${claim.claim_text}"`);
      lines.push(`  Issue: ${f.message}`);
      lines.push(`  ACTION REQUIRED: Soften this claim significantly.`);
    });
  }

  lines.push("\n=== CLAIMS SORTED BY EVIDENCE STRENGTH (STRONGEST FIRST) ===");
  lines.push("IMPORTANT: You MUST reorder the benefits in your output to match this strength order.");
  lines.push("Benefits with stronger evidence should appear first.\n");

  for (let i = 0; i < claimsWithStrength.length; i++) {
    const { claim, index, strength, intervention } = claimsWithStrength[i];
    const claimFlags = flags.filter((f) => f.claim_index === index);
    const hasFlags = claimFlags.length > 0;

    const studyType = intervention
      ? intervention.human_lifespan_evidence ||
        intervention.human_healthspan_evidence !== "none"
        ? intervention.rct_presence !== "none"
          ? "Human RCTs"
          : "Human studies"
        : intervention.animal_lifespan_evidence !== "none"
          ? "Animal studies"
          : "Limited evidence"
      : "Unknown";

    lines.push(`[Rank ${i + 1}] Evidence Strength: ${strength} | ${studyType}`);
    lines.push(`  Original position: ${index + 1}`);
    lines.push(`  Claim: "${claim.claim_text}"`);
    lines.push(
      `  Type: ${claim.claim_type} | Certainty: ${claim.detected_certainty_level} | Evidence tier: ${intervention?.evidence_label || "unknown"}${hasFlags ? " | ⚠️ HAS FLAGS - MUST SOFTEN" : ""}`
    );
    if (intervention) {
      lines.push(
        `  Human healthspan: ${intervention.human_healthspan_evidence} | RCTs: ${intervention.rct_presence} | Meta-analyses: ${intervention.meta_analysis_presence ? "Yes" : "No"}`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

const REWRITE_SYSTEM = `You are an evidence-calibration editor for longevity content.
Your task is to rewrite the given raw response so that certainty matches evidence strength.

CRITICAL RULES:

1. **REORDER BY EVIDENCE STRENGTH**: The claims are provided sorted by evidence strength (strongest first). You MUST reorder the benefits/claims in your output to match this order. Benefits with stronger evidence (Human RCTs, meta-analyses, established evidence) should appear FIRST. Benefits with weaker evidence (animal studies only, experimental evidence) should appear LATER.

2. **CATEGORIZE BY STUDY TYPE**: When describing each benefit, indicate the type of evidence:
   - For "Human RCTs": Mention "Human randomized controlled trials" or "Clinical trials" or "RCTs"
   - For "Animal studies": Mention "Animal studies" or "Preclinical research" or "Animal models"
   - For "Human studies" (non-RCT): Mention "Human studies" or "Observational studies"
   - Example: "Human RCTs suggest..." vs "Animal studies have shown..." vs "Some human studies indicate..."

3. **SOFTEN LANGUAGE BASED ON FLAGS**: When a claim has flags (especially unsupported_causal_framing or minor_certainty_inflation), you MUST significantly soften the language:
   - Replace "reduces risk" → "may be associated with reduced risk" or "some studies suggest reduced risk"
   - Replace "improves" → "may improve" or "appears to improve"
   - Replace "Many practitioners report" → "Some practitioners report" or "Anecdotal reports suggest"
   - Replace strong causal verbs ("causes", "prevents", "extends") → "may contribute to", "could potentially", "has been linked to"
   - Add qualifiers: "potentially", "may", "could", "appears to", "some evidence suggests"

4. **EVIDENCE TIER LANGUAGE**:
   - "experimental" or "emerging" → Use speculative language ("may", "could", "preliminary evidence suggests", "early research indicates")
   - "promising" → "Some evidence suggests", "appears to", "may"
   - "supported" or "established" → Can use stronger language but still be precise ("research indicates", "studies show", "evidence supports")

5. **DO NOT**:
   - Add moralizing tone, medical directives, or warnings
   - Say "consult a doctor" or "this is not medical advice"
   - Preserve the original order - you MUST reorder by evidence strength

6. **PRESERVE**: Structure, helpfulness, and clarity - only adjust certainty, causal framing, order, and study type indicators.

7. **MAKE SIGNIFICANT CHANGES**: When flags are present, don't just add one "may" or "potentially" - substantially soften the claim.

Output ONLY the rewritten response text, with benefits reordered by evidence strength. No preamble, no explanation.`;

export async function rewriteResponse(
  rawResponse: string,
  claims: ExtractedClaim[],
  flags: EvidenceFlag[],
  evidenceMap: EvidenceMapEntry[],
  router: ModelRouter
): Promise<string> {
  const context = formatEvidenceContext(claims, flags, evidenceMap);
  const userMessage = `Claims and evidence flags:\n${context}\n\nRaw response to rewrite:\n\n${rawResponse}`;
  return router.complete({
    taskType: "rewrite",
    promptVersion: PROMPT_VERSION.rewrite_guarded,
    systemPrompt: REWRITE_SYSTEM,
    userMessage,
  });
}

