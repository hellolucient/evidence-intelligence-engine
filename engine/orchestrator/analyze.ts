/**
 * Evidence Intelligence Engine – orchestration: query → raw → claims → flags → rewrite → score.
 *
 * Phase 4: engine service split (docs/EIE-v2-upgrade-plan.md §7).
 * Behavior is intended to remain unchanged.
 */

import type { AnalyzeInput, AnalyzeResponse, SearchSlots } from "../types";
import { useEvidenceMap } from "../config";
import { loadEvidenceMap, isQueryInScope } from "../services/evidence-map";
import { createModelRouter } from "../llm/model-router";
import { PROMPT_VERSION } from "../prompts/registry";
import { extractClaims } from "../services/claim-parser";
import { parseSearchSlots } from "../services/query-parser";
import { detectFlags } from "../services/policy-engine";
import { computeCoherenceScore } from "../services/scoring-service";
import { rewriteResponse } from "../services/rewrite-service";
import { claimToSearchSlots } from "@/lib/literature-query";
import { RAW_ANSWER_SYSTEM, buildRawAnswerUserMessage } from "../services/answer-prompt";

const LONGIVITY_SYSTEM = RAW_ANSWER_SYSTEM;

const LONGEVITY_KEYWORDS = [
  "longevity",
  "lifespan",
  "lifespan extension",
  "live longer",
  "longer life",
  "age",
  "aging",
  "anti-aging",
  "biohacking",
  "healthspan",
  "longevity intervention",
  "longevity protocol",
  "fasting",
  "fast",
  "caloric restriction",
  "calorie restriction",
  "CR",
  "metformin",
  "rapamycin",
  "senolytics",
  "senolytic",
  "nad",
  "nmn",
  "nr",
  "nicotinamide",
  "testosterone",
  "trt",
  "hormone",
  "hormone replacement",
  "resveratrol",
  "spermidine",
  "berberine",
  "quercetin",
  "fisetin",
  "dasatinib",
  "exercise",
  "workout",
  "training",
  "fitness",
  "sleep",
  "sleep optimization",
  "sleep quality",
  "meditation",
  "meditate",
  "mindfulness",
  "sauna",
  "cold exposure",
  "heat exposure",
  "vitamin d",
  "omega-3",
  "omega 3",
  "ketogenic",
  "keto",
  "intermittent fasting",
  "IF",
  "plant-based",
  "mediterranean diet",
  "blue zone",
  "blood sugar",
  "blood pressure",
  "glucose",
  "biological age",
  "epigenetic age",
  "age testing",
];

const OUT_OF_SCOPE_MESSAGE = `This question is outside the scope of the Evidence Intelligence Engine. The system is designed to analyze longevity and biohacking interventions that are included in our curated evidence map (such as fasting, caloric restriction, metformin, rapamycin, NAD boosters, senolytics, testosterone optimization, and other longevity-focused interventions).

For questions about general health, nutrition, sleep, or other topics not specifically related to longevity interventions, please consult other resources.`;

const NOT_IN_MAP_MESSAGE = `This topic is relevant to longevity and biohacking, but it is not yet included in our curated evidence map. The Evidence Intelligence Engine can only analyze interventions that have been added to our evidence database.

Currently supported interventions include: fasting, caloric restriction, metformin, rapamycin, NAD boosters, senolytics, testosterone optimization, exercise, sleep optimization, meditation, sauna, cold exposure, and others.

We're continuously expanding our evidence map. If you'd like to see this intervention added, please check back later.`;

function isLongevityRelated(query: string): boolean {
  const lower = query.toLowerCase();
  return LONGEVITY_KEYWORDS.some((keyword) =>
    lower.includes(keyword.toLowerCase())
  );
}

export async function analyze(
  input: AnalyzeInput,
  options?: {
    llm?: import("../llm/provider").LLMProvider;
    fetchPubmed?: (
      topic: string,
      slots?: SearchSlots | null
    ) => Promise<import("../types").PubMedSummary | null>;
  }
): Promise<AnalyzeResponse> {
  const router = createModelRouter({ llm: options?.llm });
  const fetchPubmed = options?.fetchPubmed ?? (() => Promise.resolve(null));

  // Optional curated evidence map scope gate (off by default — set EIE_USE_EVIDENCE_MAP=true to enable)
  const evidenceMap = useEvidenceMap() ? await loadEvidenceMap() : [];
  const mapEnabled = useEvidenceMap();

  if (mapEnabled) {
    const inMap = isQueryInScope(evidenceMap, input.query);
    if (!inMap) {
      if (isLongevityRelated(input.query)) {
        return {
          raw_response: NOT_IN_MAP_MESSAGE,
          guarded_response: NOT_IN_MAP_MESSAGE,
          claims: [],
          evidence_flags: [],
          coherence_score: 100,
          pubmed_summary: undefined,
        };
      }
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

  const query_parse = await parseSearchSlots(input.query, router);
  const raw_response = await router.complete({
    taskType: "raw_answer",
    promptVersion: PROMPT_VERSION.raw_answer,
    systemPrompt: LONGIVITY_SYSTEM,
    userMessage: buildRawAnswerUserMessage(input.query, query_parse),
  });
  const claims = await extractClaims(raw_response, router, query_parse);
  const evidence_flags = detectFlags(claims, evidenceMap, input.query, query_parse);
  const coherence_score = computeCoherenceScore(evidence_flags);
  const guarded_response = await rewriteResponse(
    raw_response,
    claims,
    evidence_flags,
    evidenceMap,
    router,
    { query: input.query, slots: query_parse }
  );

  let pubmed_summary: AnalyzeResponse["pubmed_summary"] = undefined;
  let claim_pubmed_data: AnalyzeResponse["claim_pubmed_data"] = undefined;
  let claim_study_data: AnalyzeResponse["claim_study_data"] = undefined;
  let topic_study_data: AnalyzeResponse["topic_study_data"] = undefined;

  // Always run PubMed when requested (topic-level RCT/meta counts + study links)
  if (input.includePubmed) {
    try {
      pubmed_summary = (await fetchPubmed(input.query, query_parse)) ?? undefined;
    } catch (err) {
      console.error("PubMed summary fetch failed:", err);
    }

    try {
      const { searchStudiesForTopic } = await import("@/lib/study-search");
      const topicStudies = await searchStudiesForTopic(input.query, query_parse);
      if (topicStudies.studies.length > 0 || topicStudies.rct_count > 0) {
        topic_study_data = topicStudies;
      }
    } catch (err) {
      console.error("Topic study search failed:", err);
    }

    // Fetch multi-source study data for each claim (PubMed + Semantic Scholar)
    if (claims.length > 0) {
      const { searchStudiesForClaim } = await import("@/lib/study-search");
      const claimStudyPromises = claims.map(async (claim, index) => {
        try {
          const claimSlots = claimToSearchSlots(claim, query_parse);
          const studyData = await searchStudiesForClaim(
            claim.claim_text,
            input.query,
            claimSlots
          );

          return {
            claim_index: index,
            rct_count: studyData.rct_count,
            meta_analysis_count: studyData.meta_analysis_count,
            studies: studyData.studies,
          };
        } catch (err) {
          console.error(`Failed to fetch study data for claim ${index}:`, err);
          return {
            claim_index: index,
            rct_count: 0,
            meta_analysis_count: 0,
            studies: [],
          };
        }
      });

      const claimStudyResults = await Promise.all(claimStudyPromises);
      if (claimStudyResults.length > 0) {
        claim_study_data = claimStudyResults;
      }
    }
  }

  const { rollupLiterature } = await import("@/lib/literature-rollup");
  const literature_summary = rollupLiterature(
    pubmed_summary,
    claim_study_data,
    topic_study_data,
    query_parse
  );

  return {
    raw_response,
    guarded_response,
    claims,
    evidence_flags,
    coherence_score,
    query_parse,
    pubmed_summary,
    literature_summary,
    claim_pubmed_data,
    claim_study_data,
    topic_study_data,
  };
}

