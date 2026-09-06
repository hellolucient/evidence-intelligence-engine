/**
 * Optional PubMed E-utilities client – counts only (RCT, meta-analysis, volume).
 * Do NOT parse full papers.
 */

import type { PubMedSummary, SearchSlots } from "@/engine/types";
import {
  buildPubMedQueryFromSlots,
  buildTopicPubMedQuery,
  hasDistinctInterventionClass,
} from "@/lib/literature-query";
import { ncbiEsearchCount } from "@/lib/ncbi-eutils";

/**
 * Get RCT count, meta-analysis count, and publication volume (last 10 years) for the topic.
 * When the user named equipment with a distinct therapy class, count both grains.
 */
export async function fetchPubMedSummary(
  query: string,
  slots?: SearchSlots | null
): Promise<PubMedSummary | null> {
  const classQuery =
    slots && hasDistinctInterventionClass(slots)
      ? buildPubMedQueryFromSlots(slots, "class")
      : buildTopicPubMedQuery(query, slots);
  const specificQuery =
    slots && hasDistinctInterventionClass(slots)
      ? buildPubMedQueryFromSlots(slots, "specific")
      : "";
  if (!classQuery) return null;

  try {
    const countJobs: Array<Promise<number>> = [
      ncbiEsearchCount(`(${classQuery}) AND randomized controlled trial[pt]`),
      ncbiEsearchCount(`(${classQuery}) AND meta-analysis[pt]`),
      ncbiEsearchCount(`(${classQuery}) AND ("2015"[PDAT] : "2026"[PDAT])`),
    ];
    if (specificQuery) {
      countJobs.push(
        ncbiEsearchCount(`(${specificQuery}) AND randomized controlled trial[pt]`),
        ncbiEsearchCount(`(${specificQuery}) AND meta-analysis[pt]`)
      );
    }

    const [
      rct_count,
      meta_analysis_count,
      publication_volume_last_10_years,
      specific_rct_count,
      specific_meta_analysis_count,
    ] = await Promise.all(countJobs);

    console.info(
      `[EIE] pubmed class query="${classQuery}" rct=${rct_count} meta=${meta_analysis_count} volume=${publication_volume_last_10_years}` +
        (specificQuery
          ? ` specific query="${specificQuery}" rct=${specific_rct_count ?? 0} meta=${specific_meta_analysis_count ?? 0}`
          : "")
    );

    return {
      rct_count,
      meta_analysis_count,
      publication_volume_last_10_years,
      pubmed_query: classQuery,
      intervention_class: slots?.intervention_class,
      ...(specificQuery
        ? {
            specific_pubmed_query: specificQuery,
            specific_rct_count: specific_rct_count ?? 0,
            specific_meta_analysis_count: specific_meta_analysis_count ?? 0,
          }
        : {}),
    };
  } catch (err) {
    console.error("fetchPubMedSummary failed for topic:", classQuery, err);
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
