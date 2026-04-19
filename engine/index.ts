/**
 * Evidence Intelligence Engine – orchestration: query → raw → claims → flags → rewrite → score.
 */

import type { AnalyzeInput, AnalyzeResponse } from "./types";
import { loadEvidenceMap, isQueryInScope } from "./evidence-map";
import { defaultProvider } from "./llm/provider";
import { extractClaims } from "./claim-extractor";
import { detectFlags } from "./certainty-alignment";
import { computeCoherenceScore } from "./coherence-score";
import { rewriteResponse } from "./rewrite-engine";

const LONGIVITY_SYSTEM = `You are a helpful longevity and biohacking advisor. Answer the user's question based on current evidence. Be informative and concise.`;

const LONGEVITY_KEYWORDS = [
  "longevity", "lifespan", "lifespan extension", "live longer", "longer life", "age", "aging", "anti-aging",
  "biohacking", "healthspan", "longevity intervention", "longevity protocol",
  "fasting", "fast", "caloric restriction", "calorie restriction", "CR",
  "metformin", "rapamycin", "senolytics", "senolytic",
  "nad", "nmn", "nr", "nicotinamide",
  "testosterone", "trt", "hormone", "hormone replacement",
  "resveratrol", "spermidine", "berberine", "quercetin", "fisetin", "dasatinib",
  "exercise", "workout", "training", "fitness",
  "sleep", "sleep optimization", "sleep quality",
  "meditation", "meditate", "mindfulness",
  "sauna", "cold exposure", "heat exposure",
  "vitamin d", "omega-3", "omega 3",
  "ketogenic", "keto", "intermittent fasting", "IF",
  "plant-based", "mediterranean diet", "blue zone",
  "blood sugar", "blood pressure", "glucose",
  "biological age", "epigenetic age", "age testing"
];

const OUT_OF_SCOPE_MESSAGE = `This question is outside the scope of the Evidence Intelligence Engine. The system is designed to analyze longevity and biohacking interventions that are included in our curated evidence map (such as fasting, caloric restriction, metformin, rapamycin, NAD boosters, senolytics, testosterone optimization, and other longevity-focused interventions).

For questions about general health, nutrition, sleep, or other topics not specifically related to longevity interventions, please consult other resources.`;

const NOT_IN_MAP_MESSAGE = `This topic is relevant to longevity and biohacking, but it is not yet included in our curated evidence map. The Evidence Intelligence Engine can only analyze interventions that have been added to our evidence database.

Currently supported interventions include: fasting, caloric restriction, metformin, rapamycin, NAD boosters, senolytics, testosterone optimization, exercise, sleep optimization, meditation, sauna, cold exposure, and others.

We're continuously expanding our evidence map. If you'd like to see this intervention added, please check back later.`;

function isLongevityRelated(query: string): boolean {
  const lower = query.toLowerCase();
  return LONGEVITY_KEYWORDS.some(keyword => lower.includes(keyword.toLowerCase()));
}

export async function analyze(
  input: AnalyzeInput,
  options?: { llm?: import("./llm/provider").LLMProvider; fetchPubmed?: (topic: string) => Promise<import("./types").PubMedSummary | null> }
): Promise<AnalyzeResponse> {
  const llm = options?.llm ?? defaultProvider;
  const fetchPubmed = options?.fetchPubmed ?? (() => Promise.resolve(null));

  // Check scope first - load evidence map and see if query relates to any interventions
  const evidenceMap = await loadEvidenceMap();
  const inMap = isQueryInScope(evidenceMap, input.query);
  
  if (!inMap) {
    // Check if it's longevity-related but just not in the map
    if (isLongevityRelated(input.query)) {
      return {
        raw_response: NOT_IN_MAP_MESSAGE,
        guarded_response: NOT_IN_MAP_MESSAGE,
        claims: [],
        evidence_flags: [],
        coherence_score: 100,
        pubmed_summary: undefined,
      };
    } else {
      // Truly outside scope
      return {
        raw_response: OUT_OF_SCOPE_MESSAGE,
        guarded_response: OUT_OF_SCOPE_MESSAGE,
        claims: [],
        evidence_flags: [],
        coherence_score: 100,
        pubmed_summary: undefined,
      };
    }
  }

  const raw_response = await llm.complete(LONGIVITY_SYSTEM, input.query);
  const claims = await extractClaims(raw_response, llm);
  const evidence_flags = detectFlags(claims, evidenceMap);
  const coherence_score = computeCoherenceScore(evidence_flags);
  const guarded_response = await rewriteResponse(
    raw_response,
    claims,
    evidence_flags,
    evidenceMap,
    llm
  );

  let pubmed_summary: AnalyzeResponse["pubmed_summary"] = undefined;
  let claim_pubmed_data: AnalyzeResponse["claim_pubmed_data"] = undefined;
  let claim_study_data: AnalyzeResponse["claim_study_data"] = undefined;
  
  // Always run PubMed when requested (topic-level RCT/meta counts)
  if (input.includePubmed) {
    const topic = input.query.slice(0, 80).replace(/\?/g, "").trim();
    try {
      pubmed_summary = (await fetchPubmed(topic)) ?? undefined;
    } catch (err) {
      console.error("PubMed summary fetch failed:", err);
    }
    
    // Fetch multi-source study data for each claim (PubMed + Semantic Scholar)
    if (claims.length > 0) {
      const { searchStudiesForClaim } = await import("@/lib/study-search");
      const claimStudyPromises = claims.map(async (claim, index) => {
        try {
          const studyData = await searchStudiesForClaim(claim.claim_text, input.query);
          
          // Only include if we found studies
          if (studyData.studies.length > 0 || studyData.rct_count > 0) {
            return {
              claim_index: index,
              rct_count: studyData.rct_count,
              meta_analysis_count: studyData.meta_analysis_count,
              studies: studyData.studies,
            };
          }
        } catch (err) {
          console.error(`Failed to fetch study data for claim ${index}:`, err);
        }
        return null;
      });
      
      const claimStudyResults = await Promise.all(claimStudyPromises);
      const validStudyResults = claimStudyResults.filter((d): d is NonNullable<typeof d> => d !== null);
      
      if (validStudyResults.length > 0) {
        claim_study_data = validStudyResults;
      }
    }
  }

  return {
    raw_response,
    guarded_response,
    claims,
    evidence_flags,
    coherence_score,
    pubmed_summary,
    claim_pubmed_data,
    claim_study_data,
  };
}
