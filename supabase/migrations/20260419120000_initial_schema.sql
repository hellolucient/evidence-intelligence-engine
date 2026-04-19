-- EIE v2 initial schema (Phase 2)
-- See docs/EIE-v2-upgrade-plan.md §3

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.source_type AS ENUM (
  'label',
  'url',
  'pdf',
  'brochure',
  'manual_input',
  'upload'
);

CREATE TYPE public.review_status AS ENUM (
  'pending',
  'flagged',
  'reviewed',
  'approved',
  'needs_followup'
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  brand text,
  name text NOT NULL,
  variant_or_sku text,
  category text,
  region_or_market text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------

CREATE TABLE public.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  source_type public.source_type NOT NULL,
  title text,
  raw_text text,
  extracted_text text,
  source_url text,
  content_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TRIGGER sources_set_updated_at
  BEFORE UPDATE ON public.sources
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE INDEX sources_source_type_idx ON public.sources (source_type);

CREATE INDEX sources_content_hash_idx
  ON public.sources (content_hash)
  WHERE content_hash IS NOT NULL;

-- ---------------------------------------------------------------------------
-- analyses
-- ---------------------------------------------------------------------------

CREATE TABLE public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  query_text text NOT NULL,
  include_pubmed boolean NOT NULL DEFAULT false,
  product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  source_id uuid REFERENCES public.sources (id) ON DELETE SET NULL,
  raw_response text NOT NULL DEFAULT '',
  guarded_response text NOT NULL DEFAULT '',
  coherence_score integer NOT NULL DEFAULT 0,
  pubmed_summary jsonb,
  claim_study_data jsonb,
  review_status public.review_status NOT NULL DEFAULT 'pending',
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by text,
  needs_followup boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX analyses_product_id_idx ON public.analyses (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX analyses_source_id_idx ON public.analyses (source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX analyses_review_status_idx ON public.analyses (review_status);

CREATE INDEX analyses_created_at_idx ON public.analyses (created_at DESC);

-- ---------------------------------------------------------------------------
-- claims
-- ---------------------------------------------------------------------------

CREATE TABLE public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses (id) ON DELETE CASCADE,
  claim_index integer NOT NULL,
  claim_text text NOT NULL,
  claim_type text NOT NULL,
  detected_certainty_level text NOT NULL,
  product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  source_id uuid REFERENCES public.sources (id) ON DELETE SET NULL,
  needs_followup boolean NOT NULL DEFAULT false,
  CONSTRAINT claims_claim_index_nonnegative CHECK (claim_index >= 0),
  CONSTRAINT claims_analysis_id_claim_index_key UNIQUE (analysis_id, claim_index)
);

CREATE INDEX claims_analysis_id_idx ON public.claims (analysis_id);

CREATE INDEX claims_product_id_idx ON public.claims (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX claims_source_id_idx ON public.claims (source_id)
  WHERE source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- evidence_entries
-- ---------------------------------------------------------------------------

CREATE TABLE public.evidence_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  intervention text NOT NULL,
  outcome text,
  population text,
  dosage text,
  duration text,
  evidence_type text,
  evidence_strength text,
  jurisdiction_sensitivity text,
  citation_metadata jsonb,
  provenance text,
  notes text,
  human_lifespan_evidence boolean NOT NULL DEFAULT false,
  human_healthspan_evidence text NOT NULL DEFAULT 'none',
  animal_lifespan_evidence text NOT NULL DEFAULT 'none',
  rct_presence text NOT NULL DEFAULT 'none',
  meta_analysis_presence boolean NOT NULL DEFAULT false,
  consensus_guideline boolean NOT NULL DEFAULT false,
  evidence_label text NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TRIGGER evidence_entries_set_updated_at
  BEFORE UPDATE ON public.evidence_entries
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE UNIQUE INDEX evidence_entries_intervention_lower_key
  ON public.evidence_entries (lower(trim(intervention)));

CREATE INDEX evidence_entries_evidence_label_idx ON public.evidence_entries (evidence_label);

CREATE INDEX evidence_entries_updated_at_idx ON public.evidence_entries (updated_at DESC);

-- ---------------------------------------------------------------------------
-- claim_evidence_links
-- ---------------------------------------------------------------------------

CREATE TABLE public.claim_evidence_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.claims (id) ON DELETE CASCADE,
  evidence_entry_id uuid NOT NULL REFERENCES public.evidence_entries (id) ON DELETE CASCADE,
  link_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT claim_evidence_links_unique_triple UNIQUE (claim_id, evidence_entry_id, link_type)
);

CREATE INDEX claim_evidence_links_evidence_entry_id_idx
  ON public.claim_evidence_links (evidence_entry_id);

-- ---------------------------------------------------------------------------
-- evidence_flags
-- ---------------------------------------------------------------------------

CREATE TABLE public.evidence_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  analysis_id uuid NOT NULL REFERENCES public.analyses (id) ON DELETE CASCADE,
  claim_index integer NOT NULL,
  claim_id uuid REFERENCES public.claims (id) ON DELETE SET NULL,
  flag_type text NOT NULL,
  severity text NOT NULL,
  penalty integer NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT evidence_flags_severity_check
    CHECK (severity IN ('low', 'medium', 'high')),
  CONSTRAINT evidence_flags_flag_type_check
    CHECK (flag_type IN (
      'lifespan_certainty_mismatch',
      'mechanism_to_lifespan_extrapolation',
      'unsupported_causal_framing',
      'minor_certainty_inflation'
    )),
  CONSTRAINT evidence_flags_claim_index_nonnegative CHECK (claim_index >= 0)
);

CREATE INDEX evidence_flags_analysis_id_idx ON public.evidence_flags (analysis_id);

CREATE INDEX evidence_flags_analysis_claim_idx_idx
  ON public.evidence_flags (analysis_id, claim_index);

CREATE INDEX evidence_flags_flag_type_idx ON public.evidence_flags (flag_type);

CREATE INDEX evidence_flags_severity_idx ON public.evidence_flags (severity);

-- ---------------------------------------------------------------------------
-- rewrites
-- ---------------------------------------------------------------------------

CREATE TABLE public.rewrites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.analyses (id) ON DELETE CASCADE,
  kind text NOT NULL,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT rewrites_analysis_id_kind_key UNIQUE (analysis_id, kind)
);

CREATE INDEX rewrites_analysis_id_idx ON public.rewrites (analysis_id);

-- ---------------------------------------------------------------------------
-- model_runs
-- ---------------------------------------------------------------------------

CREATE TABLE public.model_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  analysis_id uuid REFERENCES public.analyses (id) ON DELETE SET NULL,
  prompt_version text NOT NULL,
  task_type text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  latency_ms integer NOT NULL DEFAULT 0,
  estimated_tokens_in integer,
  estimated_tokens_out integer,
  estimated_cost_usd numeric(14, 6),
  status text NOT NULL,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT model_runs_status_check CHECK (status IN ('success', 'failure'))
);

CREATE INDEX model_runs_analysis_created_idx
  ON public.model_runs (analysis_id, created_at DESC);

CREATE INDEX model_runs_task_type_created_idx
  ON public.model_runs (task_type, created_at DESC);

CREATE INDEX model_runs_status_created_idx
  ON public.model_runs (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- animoca_tasks
-- ---------------------------------------------------------------------------

CREATE TABLE public.animoca_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  task_type text NOT NULL,
  status text NOT NULL,
  analysis_id uuid REFERENCES public.analyses (id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  scheduled_for timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT animoca_tasks_status_check CHECK (
    status IN ('queued', 'running', 'completed', 'failed', 'cancelled')
  )
);

CREATE TRIGGER animoca_tasks_set_updated_at
  BEFORE UPDATE ON public.animoca_tasks
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE INDEX animoca_tasks_analysis_id_idx ON public.animoca_tasks (analysis_id)
  WHERE analysis_id IS NOT NULL;

CREATE INDEX animoca_tasks_task_type_status_idx
  ON public.animoca_tasks (task_type, status);

CREATE INDEX animoca_tasks_queued_pickup_idx
  ON public.animoca_tasks (status, scheduled_for)
  WHERE status = 'queued' AND scheduled_for IS NOT NULL;
