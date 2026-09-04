import type {
  ClaimStudyData,
  LiteratureSummary,
  PubMedSummary,
  SearchSlots,
  TopicStudyData,
} from "@/engine/types";

type StudyLike = { title: string; source?: "pubmed" | "semantic_scholar" };

function collectStudies(
  ...studyGroups: Array<{ studies: StudyLike[] } | undefined>
): StudyLike[] {
  const unique = new Map<string, StudyLike>();
  for (const group of studyGroups) {
    for (const study of group?.studies ?? []) {
      const key = study.title.toLowerCase().trim();
      if (!key || unique.has(key)) continue;
      unique.set(key, study);
    }
  }
  return [...unique.values()];
}

/**
 * Roll up topic-level PubMed counts with per-claim and topic literature search results.
 */
export function rollupLiterature(
  pubmedSummary?: PubMedSummary,
  claimStudyData?: ClaimStudyData[],
  topicStudyData?: TopicStudyData,
  slots?: SearchSlots | null
): LiteratureSummary | undefined {
  const pubmedRctPool = pubmedSummary?.rct_count ?? 0;
  const pubmedMetaPool = pubmedSummary?.meta_analysis_count ?? 0;
  const publicationVolume = pubmedSummary?.publication_volume_last_10_years ?? 0;

  const linked = collectStudies(topicStudyData, ...(claimStudyData ?? []));
  const uniqueClaimPapers = collectStudies(...(claimStudyData ?? []));

  const claimsSearched = claimStudyData?.length ?? 0;
  const claimsWithMatches =
    claimStudyData?.filter((claimData) => claimData.studies.length > 0).length ?? 0;

  if (!pubmedSummary && !claimStudyData?.length && !topicStudyData) {
    return undefined;
  }

  return {
    pubmed_rct_pool: pubmedRctPool,
    pubmed_meta_pool: pubmedMetaPool,
    linked_papers_count: linked.length,
    claims_searched: claimsSearched,
    claims_with_matches: claimsWithMatches,
    unique_claim_papers: uniqueClaimPapers.length,
    linked_pubmed_count: linked.filter((study) => study.source === "pubmed").length,
    linked_semantic_scholar_count: linked.filter(
      (study) => study.source === "semantic_scholar"
    ).length,
    publication_volume_last_10_years: publicationVolume,
    pubmed_query: pubmedSummary?.pubmed_query,
    intervention: slots?.intervention,
    outcomes: slots?.outcomes,
    outcome_is_broad: slots?.outcome_is_broad,
    frame: slots?.frame,
  };
}
