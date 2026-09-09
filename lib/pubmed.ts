/**
 * Optional PubMed E-utilities client – counts only (RCT, meta-analysis, volume).
 * Do NOT parse full papers.
 */

import type { PubMedSummary, SearchSlots } from "@/engine/types";
import {
  buildProtocolOnlyPubMedQuery,
  buildPubMedQueryFromSlots,
  buildTopicPubMedQuery,
  hasDistinctInterventionClass,
  isFolkProtocol,
  withoutOutcomes,
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
  let classQuery =
    slots && hasDistinctInterventionClass(slots)
      ? buildPubMedQueryFromSlots(slots, "class")
      : buildTopicPubMedQuery(query, slots);
  const specificQuery =
    slots && hasDistinctInterventionClass(slots)
      ? buildPubMedQueryFromSlots(slots, "specific")
      : "";
  const protocolQuery =
    slots && isFolkProtocol(slots) ? buildProtocolOnlyPubMedQuery(slots) : "";
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
    if (protocolQuery) {
      countJobs.push(ncbiEsearchCount(protocolQuery));
    }

    const counts = await Promise.all(countJobs);
    let rct_count = counts[0] ?? 0;
    let meta_analysis_count = counts[1] ?? 0;
    let publication_volume_last_10_years = counts[2] ?? 0;
    let nextIndex = 3;
    const specific_rct_count = specificQuery ? counts[nextIndex++] : undefined;
    const specific_meta_analysis_count = specificQuery ? counts[nextIndex++] : undefined;
    const protocol_paper_count = protocolQuery ? counts[nextIndex++] : undefined;

    // Pairing an uncommon outcome (e.g. "heavy metals") can zero a real intervention.
    // Fall back to intervention-only class counts so the pool is not silently empty.
    if (
      slots &&
      !slots.outcome_is_broad &&
      rct_count === 0 &&
      meta_analysis_count === 0
    ) {
      const fallbackQuery = buildPubMedQueryFromSlots(
        withoutOutcomes(slots),
        hasDistinctInterventionClass(slots) ? "class" : "combined"
      );
      if (fallbackQuery && fallbackQuery !== classQuery) {
        const [fallbackRct, fallbackMeta, fallbackVolume] = await Promise.all([
          ncbiEsearchCount(`(${fallbackQuery}) AND randomized controlled trial[pt]`),
          ncbiEsearchCount(`(${fallbackQuery}) AND meta-analysis[pt]`),
          ncbiEsearchCount(`(${fallbackQuery}) AND ("2015"[PDAT] : "2026"[PDAT])`),
        ]);
        if (fallbackRct > 0 || fallbackMeta > 0) {
          console.info(
            `[EIE] pubmed pairing empty; fallback intervention-only query="${fallbackQuery}" rct=${fallbackRct} meta=${fallbackMeta}`
          );
          classQuery = fallbackQuery;
          rct_count = fallbackRct;
          meta_analysis_count = fallbackMeta;
          publication_volume_last_10_years = fallbackVolume;
        }
      }
    }

    console.info(
      `[EIE] pubmed class query="${classQuery}" rct=${rct_count} meta=${meta_analysis_count} volume=${publication_volume_last_10_years}` +
        (specificQuery
          ? ` specific query="${specificQuery}" rct=${specific_rct_count ?? 0} meta=${specific_meta_analysis_count ?? 0}`
          : "") +
        (protocolQuery ? ` protocol-any query="${protocolQuery}" papers=${protocol_paper_count ?? 0}` : "")
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
      ...(protocolQuery
        ? {
            protocol_pubmed_query: protocolQuery,
            protocol_paper_count: protocol_paper_count ?? 0,
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
