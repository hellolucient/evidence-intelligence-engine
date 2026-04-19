/**
 * Optional PubMed E-utilities client – counts only (RCT, meta-analysis, volume).
 * Do NOT parse full papers.
 */

import type { PubMedSummary } from "@/engine/types";

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

async function esearchCount(
  term: string,
  email?: string
): Promise<number> {
  const params = new URLSearchParams({
    db: "pubmed",
    term,
    retmode: "json",
    retmax: "0",
  });
  if (email) params.set("email", email);
  const res = await fetch(`${BASE}/esearch.fcgi?${params.toString()}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return 0;
  const data = (await res.json()) as { esearchresult?: { count?: string } };
  const count = data?.esearchresult?.count;
  return typeof count === "string" ? parseInt(count, 10) || 0 : 0;
}

/**
 * Words that often start questions but are not useful for PubMed search.
 * Including them can force 0 results (e.g. "Energises adrenal fatigue" → 0, "adrenal fatigue" → 75).
 */
const TOPIC_NOISE_PREFIXES = new Set([
  "energises", "energize", "energizes", "energising", "energizing",
  "benefits", "benefit", "what", "does", "can", "will", "how", "why", "when", "is", "are",
  "help", "helps", "treat", "treats", "fix", "fixes", "cure", "cures",
  "good", "bad", "safe", "best", "worst", "really", "actually",
  "tell", "explain", "describe", "list", "give", "find", "get", "use", "using",
  "should", "could", "would", "may", "might", "recommend", "recommendation",
]);

/**
 * Derive a PubMed topic from user query.
 * Strips leading "noise" words so we don't poison the search (e.g. "Energises adrenal fatigue" → "adrenal fatigue").
 */
function topicFromQuery(query: string): string {
  const cleaned = query.replace(/\?/g, "").trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  
  // Drop leading words that are noise for PubMed (they often cause 0 results when combined with AND)
  let start = 0;
  for (let i = 0; i < words.length; i++) {
    const lower = words[i].toLowerCase().replace(/[^\w]/g, "");
    if (!TOPIC_NOISE_PREFIXES.has(lower) && lower.length >= 2) {
      start = i;
      break;
    }
  }
  
  const topicWords = words.slice(start).slice(0, 5).join(" ");
  return topicWords || "longevity";
}

/**
 * Get RCT count, meta-analysis count, and publication volume (last 10 years) for the topic.
 */
export async function fetchPubMedSummary(
  query: string
): Promise<PubMedSummary | null> {
  const topic = topicFromQuery(query);
  const email = process.env.PUBMED_EMAIL;

  try {
    const [rct_count, meta_analysis_count, publication_volume_last_10_years] =
      await Promise.all([
        esearchCount(`${topic} AND randomized controlled trial`, email),
        esearchCount(`${topic} AND meta-analysis`, email),
        esearchCount(`${topic} AND ("2015"[PDAT] : "2025"[PDAT])`, email),
      ]);

    return {
      rct_count,
      meta_analysis_count,
      publication_volume_last_10_years,
    };
  } catch (err) {
    console.error("fetchPubMedSummary failed for topic:", topic, err);
    return null;
  }
}

/**
 * Extract key search terms from a claim text for PubMed search.
 * Combines the main intervention with claim-specific outcome/benefit terms.
 * Returns null if no meaningful outcome terms can be extracted.
 */
export function extractClaimSearchTerms(claimText: string, originalQuery: string): string | null {
  const interventionTerm = topicFromQuery(originalQuery);
  
  // Common stop words and action verbs to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'may', 'can', 'could', 'might', 'should', 'would', 'is', 'are', 'was', 'were', 'be', 'been',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'there', 'here',
    'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'must', 'shall',
    'improve', 'improves', 'improved', 'improving', 'increase', 'increases', 'increased', 'increasing',
    'reduce', 'reduces', 'reduced', 'reducing', 'decrease', 'decreases', 'decreased', 'decreasing',
    'help', 'helps', 'helped', 'helping', 'support', 'supports', 'supported', 'supporting',
    'show', 'shows', 'showed', 'showing', 'suggest', 'suggests', 'suggested', 'suggesting',
    'indicate', 'indicates', 'indicated', 'indicating', 'demonstrate', 'demonstrates', 'demonstrated', 'demonstrating',
    'lead', 'leads', 'led', 'leading', 'cause', 'causes', 'caused', 'causing', 'result', 'results', 'resulted', 'resulting',
    'promote', 'promotes', 'promoted', 'promoting', 'enhance', 'enhances', 'enhanced', 'enhancing',
    'boost', 'boosts', 'boosted', 'boosting', 'optimize', 'optimizes', 'optimized', 'optimizing',
    'better', 'best', 'more', 'less', 'much', 'very', 'also', 'well', 'good', 'great',
    'levels', 'level', 'function', 'functions', 'process', 'processes', 'mechanism', 'mechanisms'
  ]);
  
  // Extract meaningful outcome/benefit terms (biological, health-related terms)
  // Look for terms that are likely to appear in PubMed abstracts
  const words = claimText
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !stopWords.has(word));
  
  // Common health/biological outcome terms that are PubMed-searchable
  const healthTerms = words.filter(word => {
    // Filter for terms that sound like biological/health outcomes
    // This is a heuristic - terms like "insulin", "sensitivity", "repair", "autophagy", etc.
    return word.length >= 4 && 
           !word.match(/^(that|this|what|when|where|which|who|how)$/) &&
           word.match(/[a-z]{4,}/); // At least 4 letters
  });
  
  // Take the most relevant terms (up to 2 key outcome terms)
  const outcomeTerms = healthTerms.slice(0, 2).join(' ');
  
  // If we found meaningful outcome terms, combine with intervention
  if (outcomeTerms && outcomeTerms.length >= 4) {
    return `${interventionTerm} AND ${outcomeTerms}`.trim();
  }
  
  // If no meaningful outcome terms, return null to indicate we can't do claim-specific search
  return null;
}

/**
 * Get RCT and meta-analysis counts for a specific claim.
 * Returns null if we can't extract meaningful claim-specific search terms.
 */
export async function fetchClaimPubMedData(
  claimText: string,
  originalQuery: string,
  overallRctCount?: number
): Promise<{ rct_count: number; meta_analysis_count: number } | null> {
  const searchTerm = extractClaimSearchTerms(claimText, originalQuery);
  
  // If we can't extract meaningful claim-specific terms, return null
  if (!searchTerm) {
    return null;
  }
  
  const email = process.env.PUBMED_EMAIL;

  try {
    const [rct_count, meta_analysis_count] = await Promise.all([
      esearchCount(`${searchTerm} AND randomized controlled trial`, email),
      esearchCount(`${searchTerm} AND meta-analysis`, email),
    ]);

    // Only return results if they're meaningful:
    // - If we have some RCTs found, OR
    // - If the count is significantly different from overall (indicating specificity)
    // Otherwise, return null to indicate we can't meaningfully attribute RCTs to this claim
    if (rct_count > 0 || (overallRctCount && rct_count < overallRctCount * 0.9)) {
      return {
        rct_count,
        meta_analysis_count,
      };
    }
    
    return null;
  } catch {
    return null;
  }
}
