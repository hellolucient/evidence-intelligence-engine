/**
 * Shared PubMed / literature search query building.
 */

import type { SearchSlots } from "@/engine/types";

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
  "try", "our", "we", "us", "you", "youre", "guaranteed", "guarantee",
  "come", "please", "feel", "much", "better",
]);

/** Grammar words that must not become the PubMed subject and must not cut a phrase short. */
const SUBJECT_FILLER_WORDS = new Set([
  "the", "a", "an", "of", "for", "on", "in", "to", "with", "and", "or",
  "vs", "versus", "about", "by", "as",
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
  return normalizeQueryText(text)
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

/**
 * Known subject expansions — PubMed often omits marketing/product phrases like "jasmine tea"
 * but indexes the underlying compound or category (green tea, L-theanine, etc.).
 */
const SUBJECT_SYNONYMS: Record<string, string[]> = {
  "jasmine tea": ["green tea", "tea", "camellia sinensis", "l-theanine"],
  "green tea": ["tea", "camellia sinensis", "l-theanine"],
  "black tea": ["tea", "camellia sinensis"],
  "herbal tea": ["tea", "herbal"],
  "chamomile tea": ["chamomile", "tea"],
  "valerian tea": ["valerian", "tea"],
  "red light therapy": [
    "red light",
    "photobiomodulation",
    "low-level light therapy",
    "low-level laser",
    "lllt",
  ],
  "red light": [
    "red light therapy",
    "photobiomodulation",
    "low-level light therapy",
  ],
};

/** Too vague to AND into a PubMed query — they match almost the entire medical literature. */
const GENERIC_OUTCOME_WORDS = new Set([
  "light",
  "therapy",
  "treatment",
  "treatments",
  "device",
  "effect",
  "effects",
  "quality",
  "health",
  "wellbeing",
  "overall",
]);

const TRAILING_PRODUCT_WORDS = new Set([
  "bed", "device", "machine", "product", "kit", "panel", "lamp", "mask", "session",
]);

const SHORT_SUBJECT_ACRONYMS = new Set(["pbm", "lllt"]);

/** Expand closed compounds and light punctuation so marketing copy is searchable. */
export function normalizeQueryText(text: string): string {
  return text
    .replace(/\bredlight\b/gi, "red light")
    .replace(/\bnear[-]?infrared\b/gi, "near infrared")
    .replace(/you're/gi, "you are")
    .replace(/['’]/g, " ");
}

function getSubjectSearchTerms(subject: string): string[] {
  const normalized = subject.toLowerCase().trim();
  if (!normalized) return [];

  const terms = new Set<string>([normalized]);

  for (const [key, synonyms] of Object.entries(SUBJECT_SYNONYMS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      terms.add(key);
      for (const synonym of synonyms) terms.add(synonym);
    }
  }

  // Generic tea heuristic when not already expanded
  if (normalized.includes("tea")) {
    terms.add("tea");
    if (normalized.includes("jasmine") || normalized.includes("green")) {
      terms.add("green tea");
      terms.add("camellia sinensis");
      terms.add("l-theanine");
    }
  }

  if (normalized.includes("red light") || normalized.includes("photobiomodulation")) {
    terms.add("red light");
    terms.add("red light therapy");
    terms.add("photobiomodulation");
  }

  return [...terms];
}

/** Build a PubMed subject clause, OR-ing synonyms when helpful. */
export function buildSubjectPubMedClause(subject: string): string {
  const terms = getSubjectSearchTerms(subject);
  if (terms.length === 0) return "";

  const clauses = terms
    .filter((term) => term.replace(/\s+/g, "").length >= 4)
    .map((term) => quotePubMedPhrase(term))
    .filter(Boolean);

  const unique = [...new Set(clauses)];
  if (unique.length === 1) return unique[0];
  return `(${unique.join(" OR ")})`;
}

/**
 * Extract the primary intervention/subject from a user query.
 * e.g. "jasmine tea will improve your sleep" -> "jasmine tea"
 */
export function extractPrimarySubject(query: string): string {
  const words = normalizeQueryText(query)
    .replace(/\?/g, "")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  const meaningful: string[] = [];
  for (const word of words) {
    const token = normalizeToken(word);
    if (!token) continue;

    if (OUTCOME_VERBS.has(token)) {
      if (meaningful.length > 0) break;
      continue;
    }
    if (SUBJECT_FILLER_WORDS.has(token)) continue;

    if (QUERY_NOISE_WORDS.has(token)) {
      if (meaningful.length > 0) break;
      continue;
    }

    meaningful.push(word);
    if (meaningful.length >= 4) break;
  }

  while (meaningful.length > 0) {
    const last = normalizeToken(meaningful[meaningful.length - 1] ?? "");
    if (!TRAILING_PRODUCT_WORDS.has(last)) break;
    meaningful.pop();
  }

  return meaningful.join(" ").trim();
}

export function sanitizeIntervention(text: string): string {
  const normalized = normalizeQueryText(text).replace(/\?/g, "").trim();
  if (!normalized) return "";
  if (normalized.split(/\s+/).length > 6) {
    return extractPrimarySubject(normalized);
  }
  const words = normalized.split(/\s+/);
  while (words.length > 0) {
    const last = normalizeToken(words[words.length - 1] ?? "");
    if (!TRAILING_PRODUCT_WORDS.has(last)) break;
    words.pop();
  }
  return words.join(" ").trim();
}

const VAGUE_OUTCOME_PHRASES = new Set([
  ...GENERIC_OUTCOME_WORDS,
  "better",
  "wellness",
  "energy",
  "feel",
  "feeling",
  "wellbeing",
  "well-being",
  "health",
]);

export function isSpecificOutcome(term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return false;
  if (VAGUE_OUTCOME_PHRASES.has(normalized)) return false;
  if (HEALTH_OUTCOME_TERMS.includes(normalized)) return true;
  return normalized.length >= 4 && !GENERIC_OUTCOME_WORDS.has(normalized);
}

function joinOrClauses(clauses: string[]): string {
  const unique = [...new Set(clauses.filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  return `(${unique.join(" OR ")})`;
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
  "melatonin",
  "circadian",
  "inflammation",
];

const VAGUE_HEALTH_OUTCOMES = new Set(["health", "wellbeing", "well-being"]);

/**
 * Extract likely health outcome terms from query or claim text.
 * Prefer known health outcomes (sleep, melatonin, …) over leftover subject words
 * like "therapy" / "redlight", which would AND-match almost all of PubMed.
 */
export function extractOutcomeTerms(text: string, maxTerms = 2, subject = ""): string[] {
  const normalized = normalizeQueryText(text).toLowerCase();
  const outcomes: string[] = [];
  const subjectTokens = new Set(tokenize(subject));

  for (const term of HEALTH_OUTCOME_TERMS) {
    if (VAGUE_HEALTH_OUTCOMES.has(term)) continue;
    if (!normalized.includes(term)) continue;
    const label = term === "antioxidants" ? "antioxidant" : term;
    if (!outcomes.includes(label)) outcomes.push(label);
    if (outcomes.length >= maxTerms) return outcomes;
  }

  if (outcomes.length > 0) return outcomes;

  const tokens = tokenize(text);
  const verbIndex = tokens.findIndex((token) => OUTCOME_VERBS.has(token));
  const searchTokens = verbIndex >= 0 ? tokens.slice(verbIndex + 1) : tokens;

  for (const token of searchTokens) {
    if (CLAIM_STOP_WORDS.has(token)) continue;
    if (GENERIC_OUTCOME_WORDS.has(token)) continue;
    if (subjectTokens.has(token)) continue;
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
export function heuristicSearchSlots(query: string): SearchSlots {
  const intervention = extractPrimarySubject(query);
  const outcomes = extractOutcomeTerms(query, 2, intervention).filter(isSpecificOutcome);
  const lower = query.toLowerCase();
  const marketing = /\b(try our|guaranteed|buy now|order now)\b/i.test(query);
  const question = /\?/.test(query) || /^(what|does|can|how|is|are|why)\b/i.test(lower.trim());
  return {
    intervention,
    outcomes,
    frame: marketing ? "marketing" : question ? "question" : "claim",
    outcome_is_broad: outcomes.length === 0,
  };
}

export function claimToSearchSlots(
  claim: { intervention?: string; outcome?: string },
  topic: SearchSlots
): SearchSlots {
  const intervention = sanitizeIntervention(claim.intervention ?? "") || topic.intervention;
  const outcome =
    claim.outcome && isSpecificOutcome(claim.outcome)
      ? claim.outcome.trim().toLowerCase()
      : undefined;
  const outcomes = outcome ? [outcome] : topic.outcomes;
  return {
    intervention,
    outcomes,
    population: topic.population,
    frame: topic.frame,
    outcome_is_broad: outcomes.length === 0,
  };
}

export function buildPubMedQueryFromSlots(slots: SearchSlots): string {
  if (!slots.intervention) return "";
  const subjectClause = buildSubjectPubMedClause(slots.intervention);
  const specificOutcomes = slots.outcome_is_broad
    ? []
    : slots.outcomes.filter(isSpecificOutcome).slice(0, 2);
  const outcomeClause = joinOrClauses(specificOutcomes.map((outcome) => quotePubMedPhrase(outcome)));
  return [subjectClause, outcomeClause].filter(Boolean).join(" AND ");
}

export function slotsToPlainQuery(slots: SearchSlots): string {
  const outcomes = slots.outcome_is_broad ? [] : slots.outcomes.filter(isSpecificOutcome);
  return [slots.intervention, ...outcomes.slice(0, 2)].filter(Boolean).join(" ").trim();
}

export function buildTopicPubMedQuery(query: string, slots?: SearchSlots | null): string {
  const resolved = slots?.intervention ? slots : heuristicSearchSlots(query);
  return buildPubMedQueryFromSlots(resolved) || quotePubMedPhrase("longevity");
}

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

const SUBSTANCE_TERMS = [
  "caffeine",
  "l-theanine",
  "theanine",
  "melatonin",
  "antioxidant",
  "antioxidants",
  "polyphenol",
  "polyphenols",
  "egcg",
];

function extractInterventionTerms(text: string): string[] {
  const normalized = normalizeQueryText(text).toLowerCase();
  const terms = new Set<string>();

  for (const [key, synonyms] of Object.entries(SUBJECT_SYNONYMS)) {
    if (!normalized.includes(key)) continue;
    terms.add(key);
    for (const synonym of synonyms) terms.add(synonym);
  }

  if (normalized.includes("red light") || normalized.includes("photobiomodulation")) {
    terms.add("red light");
    terms.add("red light therapy");
    terms.add("photobiomodulation");
  }

  return [...terms];
}

function extractClaimSubjectTerms(claimText: string, originalQuery: string): string[] {
  const lower = normalizeQueryText(claimText).toLowerCase();
  const terms = new Set<string>();

  for (const intervention of extractInterventionTerms(`${claimText} ${originalQuery}`)) {
    terms.add(intervention);
  }

  // Substances are the subject only when no intervention (tea, red light, etc.) was found.
  if (terms.size === 0) {
    for (const substance of SUBSTANCE_TERMS) {
      if (lower.includes(substance)) {
        terms.add(substance === "l-theanine" ? "theanine" : substance.replace(/s$/, ""));
      }
    }
  }

  if (lower.includes("jasmine") || originalQuery.toLowerCase().includes("jasmine")) {
    terms.add("jasmine");
  }

  if (AROMA_PATTERNS.test(lower)) {
    terms.add("aromatherapy");
    if (lower.includes("jasmine") || originalQuery.toLowerCase().includes("jasmine")) {
      terms.add("jasmine");
      terms.add("jasmine oil");
    }
  }

  if (terms.size === 0 && INGESTION_PATTERNS.test(lower)) {
    for (const term of getSubjectSearchTerms(extractPrimarySubject(originalQuery))) {
      terms.add(term);
    }
  }

  if (terms.size === 0) {
    for (const term of getSubjectSearchTerms(extractPrimarySubject(originalQuery))) {
      terms.add(term);
    }
  }

  return [...terms];
}

function isUsableKeyword(keyword: string): boolean {
  return keyword.length >= 4 || SHORT_SUBJECT_ACRONYMS.has(keyword);
}

export function getClaimLiteratureMatchPlan(
  claimText: string,
  originalQuery: string,
  slots?: SearchSlots | null
): { subjects: string[]; outcomes: string[] } {
  if (slots?.intervention) {
    const subjects = getSubjectSearchTerms(slots.intervention)
      .map((term) => term.toLowerCase())
      .filter(isUsableKeyword);
    const outcomes = (slots.outcome_is_broad ? [] : slots.outcomes)
      .map((term) => term.toLowerCase())
      .filter(isUsableKeyword);
    return { subjects, outcomes };
  }
  const subjects = extractClaimSubjectTerms(claimText, originalQuery)
    .map((term) => term.toLowerCase())
    .filter(isUsableKeyword);
  const outcomes = extractClaimOutcomeTerms(claimText, 5)
    .map((term) => term.toLowerCase())
    .filter(isUsableKeyword);
  return { subjects, outcomes };
}

/** Keywords used to match fetched papers back to a specific claim. */
export function getClaimLiteratureKeywords(
  claimText: string,
  originalQuery: string
): string[] {
  const { subjects, outcomes } = getClaimLiteratureMatchPlan(claimText, originalQuery);
  return [...new Set([...subjects, ...outcomes])];
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
export function buildClaimPubMedQuery(
  claimText: string,
  originalQuery: string,
  slots?: SearchSlots | null
): string {
  if (slots?.intervention) {
    return buildPubMedQueryFromSlots(slots) || buildTopicPubMedQuery(originalQuery);
  }
  const subjectTerms = extractClaimSubjectTerms(claimText, originalQuery);
  const claimOutcomes = extractClaimOutcomeTerms(claimText).filter(isSpecificOutcome);
  const queryOutcomes = extractOutcomeTerms(originalQuery).filter(isSpecificOutcome);
  const outcomes = [...claimOutcomes];
  if (outcomes.length === 0) {
    for (const outcome of queryOutcomes) {
      const normalized = outcome.replace(/s$/, "");
      if (!outcomes.some((existing) => existing.replace(/s$/, "") === normalized)) {
        outcomes.push(outcome);
      }
    }
  }

  const subjectClause = buildTermsPubMedClause(subjectTerms);
  const outcomeClause = joinOrClauses(
    outcomes.slice(0, 3).map((outcome) => quotePubMedPhrase(outcome))
  );
  const parts = [subjectClause, outcomeClause].filter(Boolean);

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
  originalQuery: string,
  slots?: SearchSlots | null
): string {
  if (slots?.intervention) {
    return slotsToPlainQuery(slots) || originalQuery.replace(/\?/g, "").trim();
  }
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

export function buildPlainTopicQuery(query: string, slots?: SearchSlots | null): string {
  if (slots?.intervention) {
    return slotsToPlainQuery(slots) || query.replace(/\?/g, "").trim();
  }
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
