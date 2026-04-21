/**
 * Animoca analyst layer — types only (Phase 8). No external API integration.
 */

export const ANIMOCA_TASK_TYPES = [
  "review_flagged_analysis",
  "analyst_brief",
  "stale_evidence_check",
  "digest_daily",
  "digest_weekly",
] as const;

export type AnimocaTaskType = (typeof ANIMOCA_TASK_TYPES)[number];

export const ANIMOCA_TASK_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type AnimocaTaskStatus = (typeof ANIMOCA_TASK_STATUSES)[number];

export type AnimocaTaskEnqueueInput = {
  task_type: AnimocaTaskType;
  analysis_id?: string | null;
  payload?: Record<string, unknown>;
  scheduled_for?: string | null;
  metadata?: Record<string, unknown>;
  status?: AnimocaTaskStatus;
};

export type AnalystBriefClaim = {
  claim_index: number;
  claim_text: string;
  claim_type: string;
  detected_certainty_level: string;
  needs_followup: boolean;
};

export type AnalystBriefFlag = {
  claim_index: number;
  flag_type: string;
  severity: string;
  penalty: number;
  message: string;
};

export type AnalystBriefEvidenceLink = {
  claim_index: number;
  claim_id: string;
  evidence_entry_id: string;
  link_type: string;
  intervention: string;
  evidence_label: string;
};

export type AnalystBriefRecommendedAction = {
  task_type: AnimocaTaskType;
  reason: string;
};

export type AnalystBrief = {
  analysis_id: string;
  created_at: string;
  query_text: string;
  coherence_score: number;
  review_status: string;
  needs_followup: boolean;
  review_notes: string | null;
  raw_response: string;
  guarded_response: string;
  claims: AnalystBriefClaim[];
  evidence_flags: AnalystBriefFlag[];
  linked_evidence: AnalystBriefEvidenceLink[];
  product_context: Record<string, unknown> | null;
  source_context: Record<string, unknown> | null;
  recommended_next_actions: AnalystBriefRecommendedAction[];
};
