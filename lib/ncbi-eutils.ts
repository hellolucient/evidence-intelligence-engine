/**
 * NCBI E-utilities client with process-wide rate limiting and retries.
 *
 * PubMed allows ~3 req/s without an API key (10/s with NCBI_API_KEY). The analyze
 * path fires topic counts plus per-claim searches; unbounded Promise.all hits 429
 * and callers previously treated that as "0 results".
 */

const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "evidence_intelligence_engine";

type NcbiEsearchResult = {
  count?: string;
  idlist?: string[];
  ERROR?: string;
};

type NcbiEsearchResponse = {
  esearchresult?: NcbiEsearchResult;
  error?: string;
};

export type NcbiEsummaryPaper = {
  uid?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  pubdate?: string;
  source?: string;
};

type NcbiEsummaryResult = Record<string, NcbiEsummaryPaper | unknown> & {
  uids?: string[];
};

type NcbiEsummaryResponse = {
  result?: NcbiEsummaryResult;
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function minIntervalMs(): number {
  return process.env.NCBI_API_KEY ? 110 : 350;
}

let queue: Promise<void> = Promise.resolve();
let lastStartedAt = 0;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = Math.max(0, minIntervalMs() - (Date.now() - lastStartedAt));
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();
    return fn();
  };
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function ncbiAuthParams(): URLSearchParams {
  const params = new URLSearchParams({
    tool: TOOL,
    retmode: "json",
  });
  const email = process.env.PUBMED_EMAIL;
  const apiKey = process.env.NCBI_API_KEY;
  if (email) params.set("email", email);
  if (apiKey) params.set("api_key", apiKey);
  return params;
}

function ncbiErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as {
    error?: unknown;
    message?: unknown;
    esearchresult?: { ERROR?: unknown };
  };
  const raw =
    record.error ?? record.esearchresult?.ERROR ?? record.message ?? null;
  return raw == null ? null : String(raw);
}

async function fetchNcbiJson(url: string): Promise<unknown> {
  const maxAttempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`NCBI HTTP ${res.status}`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        throw new Error(`NCBI HTTP ${res.status}`);
      }
      const data: unknown = await res.json();
      const message = ncbiErrorMessage(data);
      if (message && /rate limit/i.test(message)) {
        lastError = new Error(`NCBI ${message}`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (message) {
        throw new Error(`NCBI error: ${message}`);
      }
      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable =
        /HTTP 429|HTTP 5|rate limit|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
          lastError.message
        );
      if (!retryable || attempt === maxAttempts - 1) throw lastError;
      await sleep(1000 * 2 ** attempt);
    }
  }

  throw lastError ?? new Error("NCBI request failed");
}

export async function ncbiEsearchCount(term: string): Promise<number> {
  const result = await ncbiEsearch(term, 0);
  return result.count;
}

export async function ncbiEsearch(
  term: string,
  retmax: number
): Promise<{ count: number; ids: string[] }> {
  return enqueue(async () => {
    const params = ncbiAuthParams();
    params.set("db", "pubmed");
    params.set("term", term);
    params.set("retmax", String(retmax));
    const data = (await fetchNcbiJson(
      `${BASE}/esearch.fcgi?${params.toString()}`
    )) as NcbiEsearchResponse;
    const countRaw = data.esearchresult?.count;
    const count =
      typeof countRaw === "string" ? parseInt(countRaw, 10) || 0 : 0;
    const ids = Array.isArray(data.esearchresult?.idlist)
      ? data.esearchresult.idlist.filter((id) => typeof id === "string")
      : [];
    return { count, ids };
  });
}

export async function ncbiEsummary(
  ids: string[]
): Promise<NcbiEsummaryPaper[]> {
  if (ids.length === 0) return [];
  return enqueue(async () => {
    const params = ncbiAuthParams();
    params.set("db", "pubmed");
    params.set("id", ids.join(","));
    params.set("rettype", "abstract");
    const data = (await fetchNcbiJson(
      `${BASE}/esummary.fcgi?${params.toString()}`
    )) as NcbiEsummaryResponse;
    const results = data.result;
    if (!results) return [];
    const uids = Array.isArray(results.uids) ? results.uids : ids;
    const papers: NcbiEsummaryPaper[] = [];
    for (const uid of uids) {
      const paper = results[uid];
      if (paper && typeof paper === "object") {
        papers.push(paper as NcbiEsummaryPaper);
      }
    }
    return papers;
  });
}

async function fetchNcbiText(url: string): Promise<string> {
  const maxAttempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`NCBI HTTP ${res.status}`);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        throw new Error(`NCBI HTTP ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable =
        /HTTP 429|HTTP 5|rate limit|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
          lastError.message
        );
      if (!retryable || attempt === maxAttempts - 1) throw lastError;
      await sleep(1000 * 2 ** attempt);
    }
  }

  throw lastError ?? new Error("NCBI request failed");
}

export function parseMedlineAbstracts(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const records = text.split(/\n(?=PMID- )/);
  for (const record of records) {
    const pmid = record.match(/PMID-\s*(\d+)/)?.[1];
    if (!pmid) continue;
    const abMatch = record.match(/\nAB\s+-\s+([\s\S]*?)(?=\n[A-Z]{2,4}\s+-|\s*$)/);
    if (!abMatch?.[1]) continue;
    out[pmid] = abMatch[1].replace(/\n\s+/g, " ").replace(/\s+/g, " ").trim();
  }
  return out;
}

export function briefAbstractSummary(abstract: string, maxChars = 420): string {
  const cleaned = abstract.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const sentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 2);
  let out = sentences.join(" ");
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 1)}…`;
  return out;
}

export async function ncbiEfetchAbstracts(
  ids: string[]
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  return enqueue(async () => {
    const params = ncbiAuthParams();
    params.set("db", "pubmed");
    params.set("id", ids.join(","));
    params.set("rettype", "medline");
    params.set("retmode", "text");
    const text = await fetchNcbiText(`${BASE}/efetch.fcgi?${params.toString()}`);
    return parseMedlineAbstracts(text);
  });
}
