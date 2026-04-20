/**
 * Multi-source study search: PubMed + Semantic Scholar
 * Aggregates RCT and meta-analysis counts and returns study links
 */

export interface Study {
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  url: string;
  source: 'pubmed' | 'semantic_scholar';
  paperId?: string; // For Semantic Scholar
  pmid?: string; // For PubMed
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

type PubMedESearchResponse = {
  esearchresult?: {
    idlist?: string[];
  };
};

type PubMedAuthor = {
  name?: string;
};

type PubMedESummaryPaper = {
  uid?: string;
  title?: string;
  authors?: PubMedAuthor[];
  pubdate?: string;
  source?: string;
};

type PubMedESummaryResult = Record<string, PubMedESummaryPaper | unknown> & {
  uids?: string[];
};

type PubMedESummaryResponse = {
  result?: PubMedESummaryResult;
};

/**
 * Search PubMed and get study details (with links)
 */
async function searchPubMedWithDetails(
  query: string,
  email?: string
): Promise<Study[]> {
  try {
    const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
    
    // First, search for paper IDs
    const searchParams = new URLSearchParams({
      db: "pubmed",
      term: `${query} AND randomized controlled trial`,
      retmode: "json",
      retmax: "20",
    });
    if (email) searchParams.set("email", email);

    const searchRes = await fetch(`${BASE}/esearch.fcgi?${searchParams.toString()}`, {
      next: { revalidate: 3600 },
    });

    if (!searchRes.ok) return [];

    const searchData = (await searchRes.json()) as PubMedESearchResponse;
    const ids = searchData.esearchresult?.idlist || [];
    
    if (ids.length === 0) return [];

    // Fetch details for these papers
    const fetchParams = new URLSearchParams({
      db: "pubmed",
      id: ids.join(','),
      retmode: "json",
      rettype: "abstract",
    });
    if (email) fetchParams.set("email", email);

    const fetchRes = await fetch(`${BASE}/esummary.fcgi?${fetchParams.toString()}`, {
      next: { revalidate: 3600 },
    });

    if (!fetchRes.ok) return [];

    const fetchData = (await fetchRes.json()) as PubMedESummaryResponse;
    const results = fetchData.result;
    if (!results) return [];

    const uids = Array.isArray(results.uids) ? results.uids : [];

    const out: Study[] = [];
    for (const uid of uids) {
      const paper = results[uid] as PubMedESummaryPaper | undefined;
      if (!paper || typeof paper.title !== "string" || typeof paper.uid !== "string") {
        continue;
      }
      out.push({
        title: paper.title || "",
        authors: (paper.authors || [])
          .slice(0, 3)
          .map((a) => a.name || "")
          .filter((n) => n.length > 0),
        year: paper.pubdate ? parseInt(paper.pubdate.split(" ")[0] ?? "", 10) || undefined : undefined,
        journal: paper.source,
        url: `https://pubmed.ncbi.nlm.nih.gov/${paper.uid}/`,
        source: "pubmed" as const,
        pmid: paper.uid,
      });
    }

    return out;
  } catch {
    return [];
  }
}

/**
 * Search for meta-analyses
 */
async function searchMetaAnalyses(
  query: string,
  email?: string,
  semanticScholarKey?: string
): Promise<Study[]> {
  const [pubmedStudies, semanticStudies] = await Promise.all([
    searchPubMedWithDetails(`${query} AND meta-analysis`, email),
    searchSemanticScholar(`${query} meta-analysis`, semanticScholarKey),
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

/**
 * Multi-source search for RCTs and meta-analyses related to a claim
 */
export async function searchStudiesForClaim(
  claimText: string,
  originalQuery: string
): Promise<StudySearchResult> {
  const searchTerm = extractClaimSearchTerms(claimText, originalQuery);

  const email = process.env.PUBMED_EMAIL;
  const semanticScholarKey = process.env.SEMANTIC_SCHOLAR_API_KEY;

  // Search both sources in parallel
  const [pubmedRCTs, semanticRCTs, metaAnalyses] = await Promise.all([
    searchPubMedWithDetails(searchTerm, email),
    searchSemanticScholar(searchTerm, semanticScholarKey),
    searchMetaAnalyses(searchTerm, email, semanticScholarKey),
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

  return {
    rct_count: uniqueRCTs.length,
    meta_analysis_count: metaAnalyses.length,
    studies: [...uniqueRCTs.slice(0, 15), ...metaAnalyses.slice(0, 5)],
  };
}

/**
 * Extract key search terms from a claim text (reused from pubmed.ts logic)
 */
function extractClaimSearchTerms(claimText: string, originalQuery: string): string {
  // Extract main intervention from query
  const cleaned = originalQuery.replace(/\?/g, "").trim();
  const interventionTerm = cleaned.split(/\s+/).slice(0, 5).join(" ") || "longevity";
  
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'may', 'can', 'could', 'might', 'should', 'would', 'is', 'are', 'was', 'were', 'be', 'been',
    'improve', 'improves', 'improved', 'improving', 'increase', 'increases', 'increased', 'increasing',
    'reduce', 'reduces', 'reduced', 'reducing', 'help', 'helps', 'helped', 'helping',
    'show', 'shows', 'showed', 'showing', 'suggest', 'suggests', 'suggested', 'suggesting',
  ]);
  
  const words = claimText
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !stopWords.has(word))
    .slice(0, 2)
    .join(' ');
  
  if (words && words.length >= 4) {
    return `${interventionTerm} ${words}`.trim();
  }
  
  return interventionTerm;
}
