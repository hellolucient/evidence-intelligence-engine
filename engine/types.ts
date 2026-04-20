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

export interface ExtractedClaim {
  claim_text: string;
  claim_type: ClaimType;
  detected_certainty_level: CertaintyLevel;
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
  | "minor_certainty_inflation";

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
}

export interface ClaimStudyData {
  claim_index: number;
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
  pubmed_summary?: PubMedSummary;
  claim_pubmed_data?: ClaimPubMedData[];
  claim_study_data?: ClaimStudyData[];
}
