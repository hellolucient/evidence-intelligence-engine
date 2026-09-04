/**
 * Shared PubMed / literature search query building.
 */

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
};

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

  return [...terms];
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
 * e.g. "jasmine tea will improve your sleep" -> "jasmine tea"
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

  return meaningful.join(" ").trim();
}

function joinOrClauses(clauses: string[]): string {
  const unique = [...new Set(clauses.filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  return `(${unique.join(" OR ")})`;
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

  const subjectClause = subject ? buildSubjectPubMedClause(subject) : "";
  const outcomeClause = joinOrClauses(outcomes.map((outcome) => quotePubMedPhrase(outcome)));
  const parts = [subjectClause, outcomeClause].filter(Boolean);

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

function extractClaimSubjectTerms(claimText: string, originalQuery: string): string[] {
  const lower = claimText.toLowerCase();
  const terms = new Set<string>();

  for (const substance of SUBSTANCE_TERMS) {
    if (lower.includes(substance)) {
      terms.add(substance === "l-theanine" ? "theanine" : substance.replace(/s$/, ""));
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
    } else {
      const primary = extractPrimarySubject(originalQuery);
      if (primary) terms.add(primary);
    }
  }

  if (INGESTION_PATTERNS.test(lower)) {
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
