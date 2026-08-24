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
  const topicRct = Math.max(
    pubmedSummary?.rct_count ?? 0,
    topicStudyData?.rct_count ?? 0
  );
  const topicMeta = Math.max(
    pubmedSummary?.meta_analysis_count ?? 0,
    topicStudyData?.meta_analysis_count ?? 0
  );
  const publicationVolume = pubmedSummary?.publication_volume_last_10_years ?? 0;

  let claimRct = 0;
  let claimMeta = 0;
  for (const claimData of claimStudyData ?? []) {
    claimRct += claimData.rct_count;
    claimMeta += claimData.meta_analysis_count;
  }

  const uniqueStudies = collectUniqueStudies(topicStudyData, ...(claimStudyData ?? []));

  if (!pubmedSummary && !claimStudyData?.length && !topicStudyData) {
    return undefined;
  }

  return {
    topic_rct_count: topicRct,
    topic_meta_analysis_count: topicMeta,
    claim_rct_count: claimRct,
    claim_meta_analysis_count: claimMeta,
    combined_rct_count: Math.max(topicRct, claimRct),
    combined_meta_analysis_count: Math.max(topicMeta, claimMeta),
    total_studies_found: uniqueStudies.size,
    publication_volume_last_10_years: publicationVolume,
  };
}
