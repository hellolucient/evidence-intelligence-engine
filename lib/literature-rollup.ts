import type {
  ClaimStudyData,
  LiteratureSummary,
  PubMedSummary,
  TopicStudyData,
} from "@/engine/types";

function collectUniqueStudies(
  ...studyGroups: Array<{ studies: { title: string }[] } | undefined>
): Set<string> {
  const uniqueStudies = new Set<string>();
  for (const group of studyGroups) {
    for (const study of group?.studies ?? []) {
      uniqueStudies.add(study.title.toLowerCase().trim());
    }
  }
  return uniqueStudies;
}

/**
 * Roll up topic-level PubMed counts with per-claim and topic literature search results.
 */
export function rollupLiterature(
  pubmedSummary?: PubMedSummary,
  claimStudyData?: ClaimStudyData[],
  topicStudyData?: TopicStudyData
): LiteratureSummary | undefined {
  const pubmedRctPool = pubmedSummary?.rct_count ?? 0;
  const pubmedMetaPool = pubmedSummary?.meta_analysis_count ?? 0;
  const publicationVolume = pubmedSummary?.publication_volume_last_10_years ?? 0;

  const linkedPapers = collectUniqueStudies(topicStudyData, ...(claimStudyData ?? []));
  const uniqueClaimPapers = collectUniqueStudies(...(claimStudyData ?? []));

  const claimsSearched = claimStudyData?.length ?? 0;
  const claimsWithMatches =
    claimStudyData?.filter((claimData) => claimData.studies.length > 0).length ?? 0;

  if (!pubmedSummary && !claimStudyData?.length && !topicStudyData) {
    return undefined;
  }

  return {
    pubmed_rct_pool: pubmedRctPool,
    pubmed_meta_pool: pubmedMetaPool,
    linked_papers_count: linkedPapers.size,
    claims_searched: claimsSearched,
    claims_with_matches: claimsWithMatches,
    unique_claim_papers: uniqueClaimPapers.size,
    publication_volume_last_10_years: publicationVolume,
  };
}
