/**
 * Shared PubMed / literature search query building.
 */

import { findIngredient, getIngredientSearchTerms } from "@/lib/ingredient-database";

const QUERY_NOISE_WORDS = new Set([
  "energises", "energize", "energizes", "energising", "energizing",
  "benefits", "benefit", "what", "does", "can", "will", "how", "why", "when", "is", "are",
  "help", "helps", "treat", "treats", "fix", "fixes", "cure", "cures",
  "good", "bad", "safe", "best", "worst", "really", "actually",
  "tell", "explain", "describe", "list", "give", "find", "get", "use", "using",
  "should", "could", "would", "may", "might", "recommend", "recommendation",
  "there", "value", "worth", "anyone", "anybody", "someone", "something",
  "about", "into", "from", "than", "then", "also", "just", "even", "still",
  "your", "their", "they", "them", "this", "that", "these", "those",
]);

const OUTCOME_VERBS = new Set([
  "improve", "improves", "improved", "improving",
  "increase", "increases", "increased", "increasing",
  "reduce", "reduces", "reduced", "reducing",
  "decrease", "decreases", "decreased", "decreasing",
  "help", "helps", "helped", "helping",
  "boost", "boosts", "boosted", "boosting",
  "enhance", "enhances", "enhanced", "enhancing",
  "support", "supports", "supported", "supporting",
  "promote", "promotes", "promoted", "promoting",
  "extend", "extends", "extended", "extending",
  "prevent", "prevents", "prevented", "preventing",
  "cause", "causes", "caused", "causing",
  "affect", "affects", "affected", "affecting",
  "benefit", "benefits", "benefited", "benefiting",
  "optimize", "optimizes", "optimized", "optimizing",
]);

const CLAIM_STOP_WORDS = new Set([
  ...QUERY_NOISE_WORDS,
  ...OUTCOME_VERBS,
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "has", "have", "had", "do", "does", "did", "be", "been", "being",
  "show", "shows", "showed", "showing", "suggest", "suggests", "suggested", "suggesting",
  "indicate", "indicates", "indicated", "indicating",
  "demonstrate", "demonstrates", "demonstrated", "demonstrating",
  "lead", "leads", "led", "leading", "result", "results", "resulted", "resulting",
  "better", "best", "more", "less", "much", "very", "also", "well", "good", "great",
  "levels", "level", "function", "functions", "process", "processes", "mechanism", "mechanisms",
  "some", "certain", "potential", "possible", "likely", "generally", "typically",
  "often", "sometimes", "usually", "commonly", "known", "thought", "believed",
]);

function normalizeToken(word: string): string {
  return word.toLowerCase().replace(/[^\w]/g, "");
}

function tokenize(text: string): string[] {
  return text
    .replace(/\?/g, " ")
    .split(/\s+/)
    .map(normalizeToken)
    .filter((word) => word.length >= 2);
}

/** Wrap multi-word phrases for tighter PubMed title/abstract matching. */
export function quotePubMedPhrase(term: string): string {
  const cleaned = term.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  if (cleaned.includes(" ")) {
    return `"${cleaned}"[tiab]`;
  }
  return `${cleaned}[tiab]`;
}

function getSubjectSearchTerms(subject: string): string[] {
  const normalized = subject.toLowerCase().trim();
  if (!normalized) return [];

  // First, try the comprehensive ingredient database
  const ingredientTerms = getIngredientSearchTerms(normalized);
  if (ingredientTerms.length > 1 || ingredientTerms[0] !== normalized) {
    // Database found something useful
    return ingredientTerms;
  }

  // Fallback to original term
  return [normalized];
}

/** Build a PubMed subject clause, OR-ing synonyms when helpful. */
export function buildSubjectPubMedClause(subject: string): string {
  const terms = getSubjectSearchTerms(subject);
  if (terms.length === 0) return "";

  const clauses = terms
    .map((term) => quotePubMedPhrase(term))
    .filter(Boolean);

  const unique = [...new Set(clauses)];
  if (unique.length === 1) return unique[0];
  return `(${unique.join(" OR ")})`;
}

/**
 * Extract the primary intervention/subject from a user query.
 * e.g. "red light therapy for skin aging" -> "red light therapy"
 * e.g. "does dance cure Alzheimer's" -> "dance"
 */
export function extractPrimarySubject(query: string): string {
  const words = query
    .replace(/\?/g, "")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  const meaningful: string[] = [];
  for (const word of words) {
    const token = normalizeToken(word);
    if (!token) continue;

    // Stop at outcome verbs
    if (OUTCOME_VERBS.has(token)) break;

    // Stop at prepositions and conjunctions after we have at least one word
    if (meaningful.length > 0 && /^(for|from|with|by|to|in|on|at|of|and|or)$/i.test(word)) {
      break;
    }

    // Skip noise words at the beginning
    if (QUERY_NOISE_WORDS.has(token)) {
      if (meaningful.length > 0) break;
      continue;
    }

    meaningful.push(word);
    if (meaningful.length >= 4) break;
  }

  return meaningful.join(" ").trim();
}

/**
 * Extract likely health outcome terms from query or claim text.
 */
export function extractOutcomeTerms(text: string, maxTerms = 2): string[] {
  const tokens = tokenize(text);
  const outcomes: string[] = [];

  const verbIndex = tokens.findIndex((token) => OUTCOME_VERBS.has(token));
  const searchTokens = verbIndex >= 0 ? tokens.slice(verbIndex + 1) : tokens;

  for (const token of searchTokens) {
    if (CLAIM_STOP_WORDS.has(token)) continue;
    if (token.length < 4) continue;
    if (!outcomes.includes(token)) {
      outcomes.push(token);
    }
    if (outcomes.length >= maxTerms) break;
  }

  return outcomes;
}

/**
 * Build a PubMed search query from a user question.
 */
export function buildTopicPubMedQuery(query: string): string {
  const subject = extractPrimarySubject(query);
  const outcomes = extractOutcomeTerms(query);

  const parts: string[] = [];
  if (subject) parts.push(buildSubjectPubMedClause(subject));
  for (const outcome of outcomes) {
    const quoted = quotePubMedPhrase(outcome);
    if (quoted && !parts.includes(quoted)) parts.push(quoted);
  }

  if (parts.length === 0) {
    const fallback = tokenize(query).slice(0, 3).join(" ");
    return buildSubjectPubMedClause(fallback) || quotePubMedPhrase("longevity");
  }

  return parts.join(" AND ");
}

const HEALTH_OUTCOME_TERMS = [
  "relaxation",
  "anxiety",
  "sleep",
  "insomnia",
  "stress",
  "antioxidant",
  "antioxidants",
  "mood",
  "depression",
  "calm",
  "arousal",
  "blood pressure",
  "heart rate",
  "cortisol",
  "health",
  "wellbeing",
  "well-being",
];

const AROMA_PATTERNS =
  /\b(scent|smell|aroma|odor|odour|olfact|inhal|aromatherapy|fragrance|perfume)\b/i;

const INGESTION_PATTERNS =
  /\b(tea|drink|beverage|cup|swallow|ingest|consume|dietary|supplement)\b/i;

function extractClaimOutcomeTerms(claimText: string, maxTerms = 3): string[] {
  const lower = claimText.toLowerCase();
  const outcomes: string[] = [];

  for (const term of HEALTH_OUTCOME_TERMS) {
    if (!lower.includes(term)) continue;
    const normalized =
      term === "antioxidants" ? "antioxidant" : term.replace(/s$/, "") === "antioxidant" ? "antioxidant" : term;
    if (!outcomes.includes(normalized)) {
      outcomes.push(normalized);
    }
    if (outcomes.length >= maxTerms) break;
  }

  if (outcomes.length > 0) return outcomes.slice(0, maxTerms);

  return extractOutcomeTerms(claimText, maxTerms);
}

function extractClaimSubjectTerms(claimText: string, originalQuery: string): string[] {
  const lower = claimText.toLowerCase();
  const terms = new Set<string>();

  // STEP 1: ALWAYS extract and include the primary subject from original query
  // This is our most reliable source of user intent
  const primarySubject = extractPrimarySubject(originalQuery);
  
  // STEP 2: Try ingredient database ONLY for the original query's primary subject
  // This helps with herbs/supplements but won't create spurious matches for other interventions
  const ingredientInfo = findIngredient(primarySubject);
  if (ingredientInfo) {
    // Add scientific name (most important for PubMed)
    terms.add(ingredientInfo.scientificName);
    // Add primary common name
    terms.add(ingredientInfo.commonNames[0]);
    // Add aliases if present
    if (ingredientInfo.aliases) {
      for (const alias of ingredientInfo.aliases) {
        terms.add(alias);
      }
    }
  } else {
    // For non-supplement interventions (red light, dance, cryo, etc.)
    // Just use the primary subject as-is
    if (primarySubject) {
      terms.add(primarySubject);
    }
  }

  // STEP 3: Check if the claim text mentions the SAME intervention with different wording
  // e.g., query says "red light therapy" but claim says "photobiomodulation"
  // Only do this if we have strong signal - look for multi-word phrases from the claim
  const claimWords = tokenize(claimText);
  for (let i = 0; i < Math.min(5, claimWords.length); i++) {
    // Try 2-3 word phrases from the claim
    const twoWord = claimWords.slice(i, i + 2).join(" ");
    const threeWord = claimWords.slice(i, i + 3).join(" ");
    
    for (const phrase of [threeWord, twoWord]) {
      if (phrase.length >= 8) { // Avoid short spurious matches
        const claimIngredient = findIngredient(phrase);
        if (claimIngredient && claimIngredient.scientificName !== ingredientInfo?.scientificName) {
          // Different ingredient mentioned in claim
          terms.add(claimIngredient.scientificName);
          terms.add(claimIngredient.commonNames[0]);
          break;
        }
      }
    }
  }

  // STEP 4: Check for compound-specific terms in the claim text
  const compoundTerms = ["antioxidant", "polyphenol", "egcg"];
  for (const compound of compoundTerms) {
    if (lower.includes(compound)) {
      terms.add(compound);
    }
  }

  // STEP 5: Handle aromatherapy context
  if (AROMA_PATTERNS.test(lower)) {
    const aromaInfo = findIngredient(primarySubject + " oil");
    if (aromaInfo) {
      terms.add(aromaInfo.scientificName);
    }
    terms.add("aromatherapy");
  }

  return [...terms];
}

/** Keywords used to match fetched papers back to a specific claim. */
export function getClaimLiteratureKeywords(
  claimText: string,
  originalQuery: string
): string[] {
  const keywords = new Set<string>();
  for (const term of extractClaimSubjectTerms(claimText, originalQuery)) {
    keywords.add(term.toLowerCase());
  }
  for (const term of extractClaimOutcomeTerms(claimText, 5)) {
    keywords.add(term.toLowerCase());
  }
  return [...keywords].filter((keyword) => keyword.length >= 4);
}

function buildTermsPubMedClause(terms: string[]): string {
  if (terms.length === 0) return "";
  const clauses = [...new Set(terms.map((term) => quotePubMedPhrase(term)).filter(Boolean))];
  if (clauses.length === 1) return clauses[0];
  return `(${clauses.join(" OR ")})`;
}

/**
 * Build a PubMed search query for a specific claim.
 */
export function buildClaimPubMedQuery(claimText: string, originalQuery: string): string {
  const subjectTerms = extractClaimSubjectTerms(claimText, originalQuery);
  const claimOutcomes = extractClaimOutcomeTerms(claimText);
  const queryOutcomes = extractOutcomeTerms(originalQuery);
  const outcomes = [...claimOutcomes];
  if (outcomes.length === 0) {
    for (const outcome of queryOutcomes) {
      const normalized = outcome.replace(/s$/, "");
      if (!outcomes.some((existing) => existing.replace(/s$/, "") === normalized)) {
        outcomes.push(outcome);
      }
    }
  }

  const parts: string[] = [];
  const subjectClause = buildTermsPubMedClause(subjectTerms);
  if (subjectClause) parts.push(subjectClause);

  for (const outcome of outcomes.slice(0, 3)) {
    const quoted = quotePubMedPhrase(outcome);
    if (quoted && !parts.includes(quoted)) parts.push(quoted);
  }

  if (parts.length === 0) {
    return buildTopicPubMedQuery(originalQuery);
  }

  return parts.join(" AND ");
}

/**
 * Build a plain-text query for Semantic Scholar and other non-PubMed APIs.
 */
export function buildPlainLiteratureQuery(
  claimText: string,
  originalQuery: string
): string {
  const subjectTerms = extractClaimSubjectTerms(claimText, originalQuery);
  const claimOutcomes = extractClaimOutcomeTerms(claimText);
  const queryOutcomes = extractOutcomeTerms(originalQuery);
  const outcomes = [...claimOutcomes];
  for (const outcome of queryOutcomes) {
    if (!outcomes.includes(outcome)) outcomes.push(outcome);
  }

  const parts = [...subjectTerms.slice(0, 4), ...outcomes.slice(0, 3)].filter(Boolean);
  return parts.join(" ").trim() || originalQuery.replace(/\?/g, "").trim();
}

export function buildPlainTopicQuery(query: string): string {
  const subject = extractPrimarySubject(query);
  const subjectTerms = getSubjectSearchTerms(subject);
  const outcomes = extractOutcomeTerms(query);
  const parts = [...subjectTerms.slice(0, 3), ...outcomes].filter(Boolean);
  return parts.join(" ").trim() || query.replace(/\?/g, "").trim();
}

/** @deprecated Use buildClaimPubMedQuery */
export function extractClaimSearchTerms(
  claimText: string,
  originalQuery: string
): string {
  return buildClaimPubMedQuery(claimText, originalQuery);
}
