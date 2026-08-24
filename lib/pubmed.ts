/**
 * Optional PubMed E-utilities client – counts only (RCT, meta-analysis, volume).
 * Do NOT parse full papers.
 */

import type { PubMedSummary } from "@/engine/types";
import { buildTopicPubMedQuery } from "@/lib/literature-query";

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
 * Get RCT count, meta-analysis count, and publication volume (last 10 years) for the topic.
 */
export async function fetchPubMedSummary(
  query: string
): Promise<PubMedSummary | null> {
  const topicQuery = buildTopicPubMedQuery(query);
  const email = process.env.PUBMED_EMAIL;

  try {
    const [rct_count, meta_analysis_count, publication_volume_last_10_years] =
      await Promise.all([
        esearchCount(`(${topicQuery}) AND randomized controlled trial[pt]`, email),
        esearchCount(`(${topicQuery}) AND meta-analysis[pt]`, email),
        esearchCount(
          `(${topicQuery}) AND ("2015"[PDAT] : "2026"[PDAT])`,
          email
        ),
      ]);

    return {
      rct_count,
      meta_analysis_count,
      publication_volume_last_10_years,
    };
  } catch (err) {
    console.error("fetchPubMedSummary failed for topic:", topicQuery, err);
    return null;
  }
}

export { buildClaimPubMedQuery, buildTopicPubMedQuery } from "@/lib/literature-query";

/**
 * Get RCT and meta-analysis counts for a specific claim.
 */
export async function fetchClaimPubMedData(
  claimText: string,
  originalQuery: string,
  overallRctCount?: number
): Promise<{ rct_count: number; meta_analysis_count: number } | null> {
  const { buildClaimPubMedQuery } = await import("@/lib/literature-query");
  const searchTerm = buildClaimPubMedQuery(claimText, originalQuery);
  const email = process.env.PUBMED_EMAIL;

  try {
    const [rct_count, meta_analysis_count] = await Promise.all([
      esearchCount(`(${searchTerm}) AND randomized controlled trial[pt]`, email),
      esearchCount(`(${searchTerm}) AND meta-analysis[pt]`, email),
    ]);

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
