/**
 * Query expansion and validation for robust PubMed searches.
 * Makes the system self-checking instead of relying on manual synonym dictionaries.
 */

import type { ModelRouter } from "@/engine/llm/model-router";

interface QueryExpansion {
  baseTerms: string[];
  variations: string[];
  abbreviations: string[];
  clinicalSynonyms: string[];
}

interface QueryValidation {
  isReasonable: boolean;
  tooNarrow: boolean;
  tooBroad: boolean;
  suggestions: string[];
  improvedQuery?: string;
}

// In-memory cache for query expansions (per intervention)
const expansionCache = new Map<string, QueryExpansion>();

/**
 * Automatic normalization: handle common variations without LLM call
 */
export function autoNormalizeIntervention(intervention: string): string[] {
  const normalized = intervention.toLowerCase().trim();
  const terms = new Set<string>([normalized]);
  
  // Handle hyphens: both with and without
  if (normalized.includes("-")) {
    terms.add(normalized.replace(/-/g, " "));
  }
  if (normalized.includes(" ") && !normalized.includes("-")) {
    // Try hyphenated version for multi-word terms
    terms.add(normalized.replace(/\s+/g, "-"));
  }
  
  // Extract base term (remove modifiers)
  const words = normalized.split(/[\s-]+/);
  if (words.length > 1) {
    // Last word is often the base term (e.g., "whole-body cryotherapy" → "cryotherapy")
    const lastWord = words[words.length - 1];
    if (lastWord && lastWord.length >= 4) {
      terms.add(lastWord);
      // Add plural if it's singular
      if (!lastWord.endsWith("s") && !lastWord.endsWith("y")) {
        terms.add(lastWord + "s");
      }
      // Add singular if it's plural
      if (lastWord.endsWith("ies")) {
        terms.add(lastWord.replace(/ies$/, "y"));
      } else if (lastWord.endsWith("s") && lastWord.length > 4) {
        terms.add(lastWord.slice(0, -1));
      }
    }
  }
  
  return [...terms];
}

/**
 * LLM-based query expansion: intelligently expand intervention terms
 */
export async function expandInterventionTerms(
  intervention: string,
  router: ModelRouter
): Promise<QueryExpansion> {
  const cacheKey = intervention.toLowerCase().trim();
  
  // Check cache first
  if (expansionCache.has(cacheKey)) {
    return expansionCache.get(cacheKey)!;
  }
  
  const prompt = `Given the health intervention "${intervention}", provide search term variations for finding research papers in PubMed.

Consider:
1. Spelling variations (hyphens, spaces, capitalization)
2. Common abbreviations or acronyms
3. Clinical/scientific synonyms used in research papers
4. Broader and narrower related terms

Return ONLY a JSON object with this structure:
{
  "baseTerms": ["primary term without modifiers"],
  "variations": ["spelling variations"],
  "abbreviations": ["common acronyms"],
  "clinicalSynonyms": ["scientific terms papers actually use"]
}

Keep each array to 2-4 most useful terms. Be concise.`;

  try {
    const response = await router.complete({
      taskType: "query_expansion",
      promptVersion: "query.expansion@v1",
      systemPrompt: "You are a medical literature search expert. Output only valid JSON.",
      userMessage: prompt,
    });
    
    const cleaned = response
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    
    const parsed = JSON.parse(cleaned) as QueryExpansion;
    
    // Validate structure
    const expansion: QueryExpansion = {
      baseTerms: Array.isArray(parsed.baseTerms) ? parsed.baseTerms : [],
      variations: Array.isArray(parsed.variations) ? parsed.variations : [],
      abbreviations: Array.isArray(parsed.abbreviations) ? parsed.abbreviations : [],
      clinicalSynonyms: Array.isArray(parsed.clinicalSynonyms) ? parsed.clinicalSynonyms : [],
    };
    
    // Cache the result
    expansionCache.set(cacheKey, expansion);
    
    return expansion;
  } catch (error) {
    console.error("Query expansion failed:", error);
    // Fallback to automatic normalization only
    return {
      baseTerms: autoNormalizeIntervention(intervention),
      variations: [],
      abbreviations: [],
      clinicalSynonyms: [],
    };
  }
}

/**
 * Validate a PubMed query before executing it
 */
export async function validatePubMedQuery(
  query: string,
  intervention: string,
  router: ModelRouter
): Promise<QueryValidation> {
  const prompt = `Evaluate this PubMed search query for finding research papers:

Query: ${query}
Original intervention: ${intervention}

Is this query:
1. Too narrow? (overly specific phrase that might miss relevant papers)
2. Too broad? (generic terms that match too much)
3. Missing important variations? (hyphens, abbreviations, synonyms)

Return ONLY a JSON object:
{
  "isReasonable": true/false,
  "tooNarrow": true/false,
  "tooBroad": true/false,
  "suggestions": ["what to add or change"],
  "improvedQuery": "better query if needed, or empty string if current is fine"
}`;

  try {
    const response = await router.complete({
      taskType: "query_validation",
      promptVersion: "query.validation@v1",
      systemPrompt: "You are a medical literature search expert. Output only valid JSON.",
      userMessage: prompt,
    });
    
    const cleaned = response
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    
    const parsed = JSON.parse(cleaned) as QueryValidation;
    
    return {
      isReasonable: parsed.isReasonable ?? true,
      tooNarrow: parsed.tooNarrow ?? false,
      tooBroad: parsed.tooBroad ?? false,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      improvedQuery: parsed.improvedQuery || undefined,
    };
  } catch (error) {
    console.error("Query validation failed:", error);
    // Assume query is reasonable if validation fails
    return {
      isReasonable: true,
      tooNarrow: false,
      tooBroad: false,
      suggestions: [],
    };
  }
}

/**
 * Get all expanded terms for an intervention (combines auto + LLM)
 */
export async function getAllInterventionTerms(
  intervention: string,
  router: ModelRouter,
  useLLM: boolean = true
): Promise<string[]> {
  const terms = new Set<string>();
  
  // Layer 1: Automatic normalization (always free)
  for (const term of autoNormalizeIntervention(intervention)) {
    terms.add(term.toLowerCase());
  }
  
  // Layer 2: LLM expansion (cached, optional)
  if (useLLM) {
    try {
      const expansion = await expandInterventionTerms(intervention, router);
      for (const term of [
        ...expansion.baseTerms,
        ...expansion.variations,
        ...expansion.abbreviations,
        ...expansion.clinicalSynonyms,
      ]) {
        if (term && term.length >= 2) {
          terms.add(term.toLowerCase());
        }
      }
    } catch (error) {
      console.error("LLM expansion failed, using auto-normalization only:", error);
    }
  }
  
  return [...terms];
}

/**
 * Clear expansion cache (useful for testing or when terms change)
 */
export function clearExpansionCache(): void {
  expansionCache.clear();
}
