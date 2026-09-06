/**
 * Evidence Intelligence Engine – shared types
 */

export type ClaimType =
  | "mechanistic"
  | "biomarker"
  | "lifespan_outcome"
  | "healthspan_outcome"
  | "intervention_effect"
  | "other";

export type CertaintyLevel = "strong" | "moderate" | "speculative";

export type QueryFrame = "question" | "marketing" | "claim";

/** Named equipment/product vs the broader therapy or compound class. */
export type InterventionGrain = "specific" | "class";

/** Which synonym set to use when building a PubMed query from slots. */
export type SearchGrain = InterventionGrain | "combined";

export type ObjectKind = "equipment" | "food" | "substance" | "protocol" | "class" | "other";

export type CriticVerdict = "accept" | "revise" | "enforced";

/** Structured search slots parsed from the user question or a single claim. */
export interface SearchSlots {
  /** What the user named — e.g. "hyperbaric chamber". */
  intervention: string;
  /** Broader therapy/compound class when distinct — e.g. "hyperbaric oxygen therapy". */
  intervention_class?: string;
  outcomes: string[];
  population?: string;
  frame: QueryFrame;
  /** True when there is no specific health outcome (e.g. “feel better”). */
  outcome_is_broad: boolean;
  /** When set, literature search uses only that grain's subject terms. */
  search_grain?: SearchGrain;
  object_kind?: ObjectKind;
  /** Nouns from the user text that must stay on the named intervention. */
  protected_nouns?: string[];
  /** Asked only when two interpretations would change which papers count. */
  clarifying_question?: string;
  parse_challenge?: string;
  critic_verdict?: CriticVerdict;
}

export interface ExtractedClaim {
  claim_text: string;
  claim_type: ClaimType;
  detected_certainty_level: CertaintyLevel;
  intervention?: string;
  outcome?: string;
  /** specific = named equipment/product; class = broader therapy. */
  grain?: InterventionGrain;
}

export type HumanHealthspanEvidence = "none" | "limited" | "moderate" | "strong";
export type AnimalLifespanEvidence = "none" | "limited" | "moderate" | "strong";
export type RctPresence = "none" | "small_trials" | "multiple_trials";
export type EvidenceLabel =
  | "experimental"
  | "emerging"
  | "promising"
  | "supported"
  | "established";

export interface EvidenceMapEntry {
  intervention: string;
  human_lifespan_evidence: boolean;
  human_healthspan_evidence: HumanHealthspanEvidence;
  animal_lifespan_evidence: AnimalLifespanEvidence;
  rct_presence: RctPresence;
  meta_analysis_presence: boolean;
  consensus_guideline: boolean;
  evidence_label: EvidenceLabel;
}

export type EvidenceFlagType =
  | "lifespan_certainty_mismatch"
  | "mechanism_to_lifespan_extrapolation"
  | "unsupported_causal_framing"
  | "minor_certainty_inflation"
  | "intervention_not_in_evidence_map"
  | "tangential_scope_match"
  | "class_to_specific_extrapolation";

export interface EvidenceFlag {
  type: EvidenceFlagType;
  claim_index: number;
  message: string;
  penalty: number;
}

export interface AnalyzeInput {
  query: string;
  includePubmed?: boolean;
  /**
   * Optional context for persistence only (Phase 6+).
   * Not required by any route and does not affect engine behavior.
   */
  product?: {
    name: string;
    brand?: string;
    variant_or_sku?: string;
    category?: string;
    region_or_market?: string;
    metadata?: Record<string, unknown>;
  };
  source?: {
    source_type: "label" | "url" | "pdf" | "brochure" | "manual_input" | "upload";
    title?: string;
    raw_text?: string;
    extracted_text?: string;
    source_url?: string;
    content_hash?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface PubMedSummary {
  rct_count: number;
  meta_analysis_count: number;
  publication_volume_last_10_years: number;
  pubmed_query?: string;
  specific_pubmed_query?: string;
  specific_rct_count?: number;
  specific_meta_analysis_count?: number;
  intervention_class?: string;
}

/** Rolled-up literature counts across topic-level PubMed and per-claim searches. */
export interface LiteratureSummary {
  /** Total RCTs returned by PubMed count API for the query topic. */
  pubmed_rct_pool: number;
  /** Total meta-analyses returned by PubMed count API for the query topic. */
  pubmed_meta_pool: number;
  /** Unique linked papers shown across topic + claim results. */
  linked_papers_count: number;
  /** Claims searched for literature. */
  claims_searched: number;
  /** Claims with at least one matched linked paper. */
  claims_with_matches: number;
  /** Unique papers matched across claim-specific filters. */
  unique_claim_papers: number;
  /** Linked papers whose source is PubMed. */
  linked_pubmed_count: number;
  /** Linked papers whose source is Semantic Scholar. */
  linked_semantic_scholar_count: number;
  publication_volume_last_10_years: number;
  pubmed_query?: string;
  intervention?: string;
  intervention_class?: string;
  outcomes?: string[];
  outcome_is_broad?: boolean;
  frame?: QueryFrame;
  specific_pubmed_query?: string;
  specific_rct_count?: number;
  specific_meta_count?: number;
}

export interface ClaimPubMedData {
  claim_index: number;
  rct_count: number;
  meta_analysis_count: number;
}

export interface Study {
  title: string;
  authors: string[];
  year?: number;
  journal?: string;
  url: string;
  source: 'pubmed' | 'semantic_scholar';
  paperId?: string;
  pmid?: string;
  grain?: InterventionGrain;
}

export interface ClaimStudyData {
  claim_index: number;
  rct_count: number;
  meta_analysis_count: number;
  studies: Study[];
}

export interface TopicStudyData {
  rct_count: number;
  meta_analysis_count: number;
  studies: Study[];
}

export interface AnalyzeResponse {
  raw_response: string;
  guarded_response: string;
  claims: ExtractedClaim[];
  evidence_flags: EvidenceFlag[];
  coherence_score: number;
  query_parse?: SearchSlots;
  pubmed_summary?: PubMedSummary;
  literature_summary?: LiteratureSummary;
  claim_pubmed_data?: ClaimPubMedData[];
  claim_study_data?: ClaimStudyData[];
  topic_study_data?: TopicStudyData;
  /** True when the raw answer omitted the named object and was repaired once. */
  prose_repaired?: boolean;
}
