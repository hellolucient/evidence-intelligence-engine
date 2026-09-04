/**
 * Optional PubMed E-utilities client – counts only (RCT, meta-analysis, volume).
 * Do NOT parse full papers.
 */

import type { PubMedSummary, SearchSlots } from "@/engine/types";
import { buildTopicPubMedQuery } from "@/lib/literature-query";
import { ncbiEsearchCount } from "@/lib/ncbi-eutils";

/**
 * Get RCT count, meta-analysis count, and publication volume (last 10 years) for the topic.
 */
export async function fetchPubMedSummary(
  query: string,
  slots?: SearchSlots | null
): Promise<PubMedSummary | null> {
  const topicQuery = buildTopicPubMedQuery(query, slots);
  if (!topicQuery) return null;

  try {
    const [rct_count, meta_analysis_count, publication_volume_last_10_years] =
      await Promise.all([
        ncbiEsearchCount(`(${topicQuery}) AND randomized controlled trial[pt]`),
        ncbiEsearchCount(`(${topicQuery}) AND meta-analysis[pt]`),
        ncbiEsearchCount(`(${topicQuery}) AND ("2015"[PDAT] : "2026"[PDAT])`),
      ]);

    console.info(
      `[EIE] pubmed topic query="${topicQuery}" rct=${rct_count} meta=${meta_analysis_count} volume=${publication_volume_last_10_years}`
    );

    return {
      rct_count,
      meta_analysis_count,
      publication_volume_last_10_years,
      pubmed_query: topicQuery,
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

  try {
    const [rct_count, meta_analysis_count] = await Promise.all([
      ncbiEsearchCount(`(${searchTerm}) AND randomized controlled trial[pt]`),
      ncbiEsearchCount(`(${searchTerm}) AND meta-analysis[pt]`),
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
