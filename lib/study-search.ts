/**
 * Multi-source study search: PubMed + Semantic Scholar
 * Aggregates RCT and meta-analysis counts and returns study links
 */

import {
  buildClaimPubMedQuery,
  buildPlainLiteratureQuery,
  buildPlainTopicQuery,
  buildProtocolOnlyPubMedQuery,
  buildPubMedQueryFromSlots,
  buildTopicPubMedQuery,
  getClaimLiteratureMatchPlan,
  hasDistinctInterventionClass,
  isFolkProtocol,
} from "@/lib/literature-query";
import { briefAbstractSummary, ncbiEfetchAbstracts, ncbiEsearch, ncbiEsummary } from "@/lib/ncbi-eutils";
import type { InterventionGrain, SearchSlots } from "@/engine/types";

export interface Study {
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  url: string;
  source: 'pubmed' | 'semantic_scholar';
  paperId?: string; // For Semantic Scholar
  pmid?: string; // For PubMed
  grain?: InterventionGrain;
  summary?: string;
}

export interface StudySearchResult {
  rct_count: number;
  meta_analysis_count: number;
  studies: Study[];
}

const SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1/paper/search";

type SemanticScholarAuthor = {
  name?: string;
};

type SemanticScholarExternalIds = {
  PubMed?: string[];
};

type SemanticScholarPaper = {
  title?: string;
  authors?: SemanticScholarAuthor[];
  year?: number;
  venue?: string;
  url?: string;
  paperId?: string;
  externalIds?: SemanticScholarExternalIds;
};

type SemanticScholarSearchResponse = {
  data?: SemanticScholarPaper[];
};

/**
 * Search Semantic Scholar for papers
 */
async function searchSemanticScholar(
  query: string,
  apiKey?: string
): Promise<Study[]> {
  try {
    const params = new URLSearchParams({
      query: `${query} randomized controlled trial`,
      limit: '20',
      fields: 'title,authors,year,venue,url,paperId,externalIds',
    });

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const res = await fetch(`${SEMANTIC_SCHOLAR_API}?${params.toString()}`, {
      headers,
      next: { revalidate: 3600 },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as SemanticScholarSearchResponse;
    const papers = data.data || [];

    return papers
      .filter((paper) => typeof paper.title === "string" && typeof paper.url === "string")
      .map((paper) => ({
        title: paper.title ?? "",
        authors: (paper.authors || [])
          .slice(0, 3)
          .map((a) => a.name || "")
          .filter((n) => n.length > 0),
        year: paper.year,
        journal: paper.venue,
        url: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
        source: 'semantic_scholar' as const,
        paperId: paper.paperId,
        pmid: paper.externalIds?.PubMed?.join(",") || undefined,
      }));
  } catch {
    return [];
  }
}

type PubMedPublicationFilter = "rct" | "meta-analysis";

function pubmedPublicationTerm(
  query: string,
  publication: PubMedPublicationFilter
): string {
  const filter =
    publication === "rct"
      ? "randomized controlled trial[pt]"
      : "meta-analysis[pt]";
  return `(${query}) AND ${filter}`;
}

/**
 * Search PubMed and get study details (with links).
 * `publication` is applied once here — callers must not also append [pt] filters.
 */
async function searchPubMedWithDetails(
  query: string,
  publication: PubMedPublicationFilter
): Promise<Study[]> {
  try {
    const term = pubmedPublicationTerm(query, publication);
    const { ids } = await ncbiEsearch(term, 20);
    if (ids.length === 0) return [];

    const papers = await ncbiEsummary(ids);
    const out: Study[] = [];
    for (const paper of papers) {
      if (typeof paper.title !== "string" || typeof paper.uid !== "string") {
        continue;
      }
      out.push({
        title: paper.title || "",
        authors: (paper.authors || [])
          .slice(0, 3)
          .map((a) => a.name || "")
          .filter((n) => n.length > 0),
        year: paper.pubdate
          ? parseInt(paper.pubdate.split(" ")[0] ?? "", 10) || undefined
          : undefined,
        journal: paper.source,
        url: `https://pubmed.ncbi.nlm.nih.gov/${paper.uid}/`,
        source: "pubmed" as const,
        pmid: paper.uid,
      });
    }

    return out;
  } catch (err) {
    console.error("[EIE] PubMed study search failed:", err);
    return [];
  }
}

async function searchPubMedAnyWithSummaries(query: string, retmax = 12): Promise<Study[]> {
  try {
    const { ids } = await ncbiEsearch(query, retmax);
    if (ids.length === 0) return [];
    const [papers, abstracts] = await Promise.all([
      ncbiEsummary(ids),
      ncbiEfetchAbstracts(ids),
    ]);
    const out: Study[] = [];
    for (const paper of papers) {
      if (typeof paper.title !== "string" || typeof paper.uid !== "string") continue;
      const summary = abstracts[paper.uid]
        ? briefAbstractSummary(abstracts[paper.uid])
        : undefined;
      out.push({
        title: paper.title || "",
        authors: (paper.authors || [])
          .slice(0, 3)
          .map((a) => a.name || "")
          .filter((n) => n.length > 0),
        year: paper.pubdate
          ? parseInt(paper.pubdate.split(" ")[0] ?? "", 10) || undefined
          : undefined,
        journal: paper.source,
        url: `https://pubmed.ncbi.nlm.nih.gov/${paper.uid}/`,
        source: "pubmed" as const,
        pmid: paper.uid,
        summary: summary || undefined,
      });
    }
    return out;
  } catch (err) {
    console.error("[EIE] PubMed protocol paper search failed:", err);
    return [];
  }
}

/**
 * Search for meta-analyses
 */
async function searchMetaAnalyses(
  pubmedQuery: string,
  plainQuery: string,
  semanticScholarKey?: string
): Promise<Study[]> {
  const [pubmedStudies, semanticStudies] = await Promise.all([
    searchPubMedWithDetails(pubmedQuery, "meta-analysis"),
    searchSemanticScholar(`${plainQuery} meta-analysis`, semanticScholarKey),
  ]);

  // Combine and deduplicate by title similarity
  const allStudies = [...pubmedStudies, ...semanticStudies];
  const unique: Study[] = [];
  const seenTitles = new Set<string>();

  for (const study of allStudies) {
    const normalizedTitle = study.title.toLowerCase().trim();
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle);
      unique.push(study);
    }
  }

  return unique.slice(0, 10);
}

function titleMatchesKeyword(title: string, keyword: string): boolean {
  return title.includes(keyword);
}

function filterStudiesForClaim(
  studies: Study[],
  claimText: string,
  originalQuery: string,
  slots?: SearchSlots | null
): Study[] {
  const { subjects, outcomes } = getClaimLiteratureMatchPlan(
    claimText,
    originalQuery,
    slots
  );
  if (subjects.length === 0 && outcomes.length === 0) return studies.slice(0, 8);

  const matched = studies.filter((study) => {
    const haystack = study.title.toLowerCase();
    const subjectHit =
      subjects.length === 0 || subjects.some((keyword) => titleMatchesKeyword(haystack, keyword));
    if (!subjectHit) return false;
    if (outcomes.length === 0) return true;
    return outcomes.some((keyword) => titleMatchesKeyword(haystack, keyword));
  });

  if (matched.length > 0) return matched.slice(0, 10);

  // If outcome is too specific, keep papers that at least mention the intervention.
  if (subjects.length > 0) {
    const subjectOnly = studies.filter((study) => {
      const haystack = study.title.toLowerCase();
      return subjects.some((keyword) => titleMatchesKeyword(haystack, keyword));
    });
    return subjectOnly.slice(0, 5);
  }

  return [];
}

/**
 * Multi-source search for RCTs and meta-analyses related to a user query topic.
 */
export async function searchStudiesForTopic(
  query: string,
  slots?: SearchSlots | null
): Promise<StudySearchResult> {
  const pubmedTerm = buildTopicPubMedQuery(query, slots);
  const plainTerm = buildPlainTopicQuery(query, slots);
  const specificTerm =
    slots && hasDistinctInterventionClass(slots)
      ? buildPubMedQueryFromSlots(slots, "specific")
      : "";

  const semanticScholarKey = process.env.SEMANTIC_SCHOLAR_API_KEY;

  console.info(`[EIE] pubmed topic study search="${pubmedTerm}"`);
  if (specificTerm) {
    console.info(`[EIE] pubmed specific study search="${specificTerm}"`);
  }

  if (slots && isFolkProtocol(slots)) {
    const protocolQuery = buildProtocolOnlyPubMedQuery(slots);
    console.info(`[EIE] pubmed protocol-any search="${protocolQuery}"`);
    const [askedRcts, protocolPapers, metaAnalyses] = await Promise.all([
      searchPubMedWithDetails(pubmedTerm, "rct"),
      protocolQuery ? searchPubMedAnyWithSummaries(protocolQuery, 12) : Promise.resolve([] as Study[]),
      searchMetaAnalyses(pubmedTerm, plainTerm, semanticScholarKey),
    ]);
    return {
      rct_count: askedRcts.length,
      meta_analysis_count: metaAnalyses.length,
      studies: protocolPapers.length > 0 ? protocolPapers : [...askedRcts, ...metaAnalyses].slice(0, 12),
    };
  }

  const [pubmedRCTs, semanticRCTs, metaAnalyses, specificRCTs] = await Promise.all([
    searchPubMedWithDetails(pubmedTerm, "rct"),
    searchSemanticScholar(plainTerm, semanticScholarKey),
    searchMetaAnalyses(pubmedTerm, plainTerm, semanticScholarKey),
    specificTerm
      ? searchPubMedWithDetails(specificTerm, "rct")
      : Promise.resolve([] as Study[]),
  ]);

  const allRCTs = [
    ...specificRCTs.map((study) => ({ ...study, grain: "specific" as const })),
    ...pubmedRCTs.map((study) => ({ ...study, grain: "class" as const })),
    ...semanticRCTs,
  ];
  const uniqueRCTs: Study[] = [];
  const seenTitles = new Set<string>();

  for (const study of allRCTs) {
    const normalizedTitle = study.title.toLowerCase().trim();
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle);
      uniqueRCTs.push(study);
    }
  }

  return {
    rct_count: uniqueRCTs.length,
    meta_analysis_count: metaAnalyses.length,
    studies: [...uniqueRCTs.slice(0, 15), ...metaAnalyses.slice(0, 5)],
  };
}

/**
 * Multi-source search for RCTs and meta-analyses related to a claim
 */
export async function searchStudiesForClaim(
  claimText: string,
  originalQuery: string,
  slots?: SearchSlots | null
): Promise<StudySearchResult> {
  const pubmedTerm = buildClaimPubMedQuery(claimText, originalQuery, slots);
  const plainTerm = buildPlainLiteratureQuery(claimText, originalQuery, slots);

  const semanticScholarKey = process.env.SEMANTIC_SCHOLAR_API_KEY;

  console.info(
    `[EIE] pubmed claim search="${pubmedTerm}" claim="${claimText.slice(0, 120)}"`
  );

  // Search both sources in parallel (NCBI calls are serialized inside ncbi-eutils)
  const [pubmedRCTs, semanticRCTs, metaAnalyses] = await Promise.all([
    searchPubMedWithDetails(pubmedTerm, "rct"),
    searchSemanticScholar(plainTerm, semanticScholarKey),
    searchMetaAnalyses(pubmedTerm, plainTerm, semanticScholarKey),
  ]);

  // Combine RCTs from both sources and deduplicate
  const allRCTs = [...pubmedRCTs, ...semanticRCTs];
  const uniqueRCTs: Study[] = [];
  const seenTitles = new Set<string>();

  for (const study of allRCTs) {
    const normalizedTitle = study.title.toLowerCase().trim();
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle);
      uniqueRCTs.push(study);
    }
  }

  const filteredRcts = filterStudiesForClaim(uniqueRCTs, claimText, originalQuery, slots);
  const filteredMeta = filterStudiesForClaim(metaAnalyses, claimText, originalQuery, slots);

  return {
    rct_count: filteredRcts.length,
    meta_analysis_count: filteredMeta.length,
    studies: [...filteredRcts.slice(0, 10), ...filteredMeta.slice(0, 3)],
  };
}
