# EIE v2 — Upgrade plan, migration map, and schema

**Purpose:** Incremental upgrade from the Next.js + TypeScript MVP to a database-backed, product/source-aware, observable EIE v2—without changing guarded-output behavior or existing API response shapes.

**Status:** Architecture and migration plan for review. **The current repo behavior is the golden reference** (see §0). No speculative Animoca SDK or external API integration.

**Related:** `README.md`, `evidence-intelligence-engine-mvp-spec.md`.

---

## 0. Golden reference (non-negotiable)

The existing MVP is the behavioral baseline. The upgrade improves **structure, observability, persistence, routing, and future agent readiness**—not the product surface users already rely on.

**Do not materially change:**

- Response shapes for `POST /api/analyze`, `claim-studies`, `menu-description`, `product-description` (field names and semantics the demo/dashboard expect).
- Demo (`/`) and dashboard (`/dashboard`) experience unless changes are **small, additive, and optional** (e.g. env-gated UI).
- Guarded-output pipeline semantics: scope gates → raw → claims → policy flags → coherence score → rewrite; optional PubMed / study enrichment.

**May change internally:** file layout under `engine/`, where persistence runs, DB rows, router config—as long as outward behavior matches the golden reference.

---

## Phase 1 — Migration map & current-state reference

Phase 1 is the bridge from “what we have” to “what we’re building.” It is documentation-first; implementation follows later phases.

### 1.1 Current file → future service / module mapping

| Current file | Future responsibility (target name may vary) |
|--------------|------------------------------------------------|
| `engine/index.ts` | **Analysis orchestrator** — thin pipeline only; no persistence. |
| `engine/claim-extractor.ts` | **Claim parser** — structured claims from raw text. |
| `engine/evidence-map.ts` | **Evidence matcher** + **evidence source** (JSON seed first; optional DB-backed loader behind flag). |
| `engine/certainty-alignment.ts` | **Policy engine** — rule hits → `EvidenceFlag`-shaped output. |
| `engine/rewrite-engine.ts` | **Rewrite service** — guarded text; may split “evidence strength context” into **scoring-service** if it stays shared. |
| `engine/coherence-score.ts` | **Scoring service** — coherence from flags. |
| `engine/llm/provider.ts` | **Provider adapters** (OpenAI, later OpenRouter, etc.) — dumb HTTP/SDK; no business escalation here. |
| *New* `engine/llm/model-router.ts` (conceptual) | **Router + escalation policy** — chooses tier/model from task, risk, flags, confidence; records runs. |
| `lib/pubmed.ts` | Stays **external evidence / corpus IO**; callable from orchestrator or a thin “study enrichment” wrapper. |
| `lib/study-search.ts` | Same; later optionally align types with `engine/types.ts`. |
| *New* `lib/persistence/*` or `lib/db/*` | **Repositories** — insert/update analyses, claims, flags, rewrites, model_runs, products, sources, links. |
| *New* `lib/analysis/*` (optional) | **Analysis application service** — `runAnalysis(input) → AnalyzeResponse` + optional `persistResult(ctx)` orchestration so **routes stay thin**. |
| `app/api/analyze/route.ts` | **Validate → call service → return JSON** only; persistence invoked from service layer, not inline SQL in the route. |
| `app/api/menu-description/route.ts`, `product-description/route.ts` | Same pattern: validate → router/service → return; optional `model_runs` logging via shared helper. |
| `lib/animoca/analyst-service.ts` (planned) | **External analyst layer** — briefs, queues, monitoring hooks; **never** on the synchronous analyze critical path. |

### 1.2 Current data shape → future DB table mapping

| Source today | Primary target table(s) | Notes |
|--------------|-------------------------|--------|
| User query string (`AnalyzeInput.query`) | `analyses.query_text` (or `prompt_text`) | Always populated for a run. |
| Optional future: brand/product/URL/PDF context | `products`, `sources`, FKs on `analyses` | MVP has no product row yet—nullable FKs preserve current flows. |
| `AnalyzeResponse.raw_response` | `analyses.raw_response` (+ optional `rewrites` row `kind=raw` if you want history) | Single column on analysis is enough for v1 persist. |
| `AnalyzeResponse.guarded_response` | **Canonical + mirror** — see §3.12 | `rewrites` holds canonical `body`; `analyses.guarded_response` is denormalized copy (same transaction). |
| `AnalyzeResponse.claims[]` | `claims` | `claim_index` = array order; store `product_id` / `source_id` nullable. |
| `AnalyzeResponse.evidence_flags[]` | `evidence_flags` | Persisted shape in **§3.7** (`claim_index` + optional `claim_id`). |
| `AnalyzeResponse.coherence_score` | `analyses.coherence_score` | Denormalized OK. |
| `AnalyzeResponse.pubmed_summary`, `claim_study_data` | `analyses` jsonb columns **or** child `analysis_enrichments` / jsonb on analysis | Keep API flat; DB can use `pubmed_summary jsonb`, `claim_study_data jsonb` on `analyses` for first pass to avoid over-normalizing external API blobs. |
| `data/evidence_map.json` (`EvidenceMapEntry`) | `evidence_entries` | **Structured columns** (§3), not a flat mirror; `raw_payload jsonb` holds original seed row for audit. |
| Policy rules (code) | N/A + `evidence_flags` outcomes | Rules stay in TS until you promote some to config. |
| Each LLM call | `model_runs` | Full audit row per call (§4, §3 schema). |
| Review (new) | `analyses.review_status`, `review_notes`, `reviewed_at`, `reviewed_by` | **First pass:** no separate `reviews` table unless a clear need appears (e.g. multi-party review history). |
| Animoca queue / events | `animoca_tasks` | Payload references `analysis_id`, task type, status. |

**Products / sources (new, early):**

| Concept | Table | When populated |
|---------|--------|------------------|
| Commercial product under evaluation | `products` | When client sends `product_id` or inline product create API exists; until then null on analysis. |
| Label, URL, PDF, brochure, pasted text | `sources` | When the client provides a distinct source artifact; see **§3.13** for query-only behavior. |

### 1.3 What remains synchronous (near term)

- Full **analyze** pipeline: scope check → LLM raw → extract claims → policy flags → score → rewrite → optional PubMed/study fetch in request.
- **Menu / product description** routes: single request → LLM → response.
- **Claim-studies** route: request → external APIs → response.

These stay **request-scoped** so demo/dashboard latency stays predictable.

### 1.4 Future-ready for asynchronous / Animoca-driven workflows

| Concern | Mechanism |
|---------|-----------|
| Human or agent follow-up | `analyses.review_status`, `analyses.needs_followup`, `claims.needs_followup` (optional), `animoca_tasks` |
| Work off the hot path | `animoca_tasks` rows: e.g. `review_flagged_analysis`, `digest_weekly`, `stale_evidence_scan` |
| Analyst brief as artifact | JSON or markdown blob in `animoca_tasks.result` or dedicated `analyst_briefs` table later if volume warrants |
| Webhooks / Telegram / email | **Not in v1** — reserved behind `lib/animoca/analyst-service.ts` or future `app/api/webhooks/*` without inventing APIs now |

### 1.5 Refactor risk classification

| Change | Risk | Rationale |
|--------|------|-----------|
| Add Supabase client + migrations (no reads in engine yet) | **Low** | No behavior change if unused. |
| Add `products` / `sources` tables + nullable FKs on analyses/claims | **Low** | Schema-only until API accepts IDs. |
| Seed `evidence_entries` from JSON with new columns | **Low** | Read path can stay JSON until flag flips. |
| Introduce `lib/persistence` + call from a new `runAnalysisWithPersistence` wrapper | **Low** | Route delegates; feature-flagged writes. |
| Split `engine/index.ts` into orchestrator + imported services (same functions) | **Low–medium** | Easy to get import cycles; keep barrel discipline. |
| Model router + escalation rules | **Medium** | Must default to **identical** model and prompts as today when only one model configured. |
| Replace JSON evidence read with DB read | **Medium** | Requires parity testing against golden outputs. |
| Any change to `AnalyzeResponse` or UI contracts | **High** | Avoid unless additive and explicitly versioned. |

---

## 2. High-level goals (EIE v2, revised)

1. **Product / source awareness from day one** — schema supports real-world inputs (labels, URLs, PDFs, brochures, uploads), not only free-text queries.
2. **Supabase** as durable store; `evidence_map.json` remains seed + fallback during migration.
3. **Structured `evidence_entries`** — first-class columns; `raw_payload` is fallback/audit only.
4. **Model routing with escalation** — not a simple model-name switch; policy-driven tier selection + observability in `model_runs`.
5. **Thin API routes** — validate → application service / orchestrator → response; persistence in repositories.
6. **Simple review model** — status (and optional notes) on `analyses` first.
7. **Animoca Analyst** as an **external persistent layer** — briefs, queues, monitoring, digests; **not** synchronous core.
8. **Backward compatible** API and UX (§0).

**Non-goals (early):** Enterprise auth, billing, heavy multi-tenant complexity, fake Animoca SDK.

---

## 3. Revised schema outline (Supabase / Postgres)

> **Conventions:** `uuid` PKs, `timestamptz`, sensible indexes on FKs and `(intervention)` / `(analysis_id)`. Exact SQL in migrations later.

**Cross-cutting details** (canonical guarded text, query-only `sources`, `prompt_version`, indexes/uniqueness) are in **§3.12–§3.15** after the per-table definitions.

### 3.1 `products`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `created_at`, `updated_at` | timestamptz | |
| `brand` | text | Nullable if unknown |
| `name` | text | Product name |
| `variant_or_sku` | text | Nullable |
| `category` | text | Nullable (e.g. supplement, device, program) |
| `region_or_market` | text | Nullable |
| `metadata` | jsonb | Flexible extras |

### 3.2 `sources`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `created_at`, `updated_at` | timestamptz | |
| `source_type` | enum | `label`, `url`, `pdf`, `brochure`, `manual_input`, `upload`, … (extend via migration) |
| `title` | text | Nullable |
| `raw_text` | text | Nullable if binary-only |
| `extracted_text` | text | Nullable; for OCR/PDF pipeline later |
| `source_url` | text | Nullable |
| `content_hash` | text | Dedup / integrity (e.g. sha256 of canonical text) |
| `metadata` | jsonb | File name, mime, page count, etc. |

### 3.3 `analyses`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `created_at` | timestamptz | |
| `query_text` | text | User query (always); see **§3.13** for relationship to `sources`. |
| `include_pubmed` | boolean | |
| `product_id` | uuid FK → products **nullable** | |
| `source_id` | uuid FK → sources **nullable** | |
| `raw_response` | text | |
| `guarded_response` | text | **Denormalized mirror** of canonical guarded text; see **§3.12** |
| `coherence_score` | int | |
| `pubmed_summary` | jsonb | Nullable |
| `claim_study_data` | jsonb | Nullable |
| `review_status` | enum | `pending`, `flagged`, `reviewed`, `approved`, `needs_followup` |
| `review_notes` | text | Nullable |
| `reviewed_at` | timestamptz | Nullable |
| `reviewed_by` | text | Nullable (user id or email later; text is fine for v1) |
| `needs_followup` | boolean | Default false; drives Animoca / human queues |
| `metadata` | jsonb | Pipeline version, feature flags, etc. |

### 3.4 `claims`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `analysis_id` | uuid FK | |
| `claim_index` | int | Order in `AnalyzeResponse.claims` |
| `claim_text` | text | |
| `claim_type` | text / enum | Align with TS union |
| `detected_certainty_level` | text / enum | |
| `product_id` | uuid FK **nullable** | Denormalized convenience |
| `source_id` | uuid FK **nullable** | |
| `needs_followup` | boolean | Optional per-claim |

### 3.5 `evidence_entries` (structured, not a JSON blob)

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `created_at`, `updated_at` | timestamptz | |
| `intervention` | text | Required for seed; indexed |
| `outcome` | text | Nullable |
| `population` | text | Nullable |
| `dosage` | text | Nullable |
| `duration` | text | Nullable |
| `evidence_type` | text | Nullable (e.g. rct, meta, animal, mechanistic) |
| `evidence_strength` | text | Nullable; can map from `evidence_label` + map fields |
| `jurisdiction_sensitivity` | text | Nullable (regulatory / claim-risk hint) |
| `citation_metadata` | jsonb | Nullable — DOIs, PMIDs, URLs, freeform |
| `provenance` | text | e.g. `seed:evidence_map.json@v1` |
| `notes` | text | Nullable |
| `human_lifespan_evidence` | boolean | From current JSON |
| `human_healthspan_evidence` | text | Enum string |
| `animal_lifespan_evidence` | text | |
| `rct_presence` | text | |
| `meta_analysis_presence` | boolean | |
| `consensus_guideline` | boolean | |
| `evidence_label` | text | experimental / emerging / … |
| `raw_payload` | jsonb | **Fallback / audit only** — original row |

### 3.6 `claim_evidence_links`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | Surrogate PK (simplifies ORM); alternatively use composite `PRIMARY KEY (claim_id, evidence_entry_id, link_type)` without `id`. |
| `claim_id` | uuid FK | |
| `evidence_entry_id` | uuid FK | |
| `link_type` | text | e.g. `matched_intervention`, `manual` |
| `metadata` | jsonb | Optional |

### 3.7 `evidence_flags` (concrete schema)

Persisted rows mirror the runtime `EvidenceFlag` shape from `engine/types.ts` and add **severity** and stable joins.

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `created_at` | timestamptz | Default `now()` |
| `analysis_id` | uuid FK → `analyses.id` **NOT NULL** | Cascade on delete analysis (or set policy explicitly in migration). |
| `claim_index` | int **NOT NULL** | Same semantics as API `claim_index` (0-based index into `AnalyzeResponse.claims`). **Always set** so reads match the golden response without requiring claims to be inserted first. |
| `claim_id` | uuid FK → `claims.id` **nullable** | Set when `claims` row exists (post-insert backfill or second pass in same transaction after claims inserted). Enables joins from flag → claim. |
| `flag_type` | text **NOT NULL** | One of: `lifespan_certainty_mismatch`, `mechanism_to_lifespan_extrapolation`, `unsupported_causal_framing`, `minor_certainty_inflation` (keep aligned with TS `EvidenceFlagType`; extend via migration if new rules are added). |
| `severity` | text **NOT NULL** | `low` \| `medium` \| `high`. **V1 mapping (deterministic):** derive from `penalty` bands — e.g. `penalty >= 20` → `high`, `>= 15` → `medium`, else `low` — or from a static map per `flag_type` in application code; store the resolved value at insert time so DB is self-describing. |
| `penalty` | int **NOT NULL** | Same numeric penalty as runtime (used for coherence score). |
| `message` | text **NOT NULL** | Same human-readable message as runtime. |
| `metadata` | jsonb | Default `{}`. Optional: rule version, matched intervention hints, engine version, `downgraded_tier`, etc. |

**Consistency:** `penalty` + `flag_type` must match what the policy engine produced for that analysis run. `severity` is an explicit persisted column for querying (e.g. “all high-severity flags”) without re-deriving from penalty in SQL.

### 3.8 `rewrites`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `analysis_id` | uuid FK | |
| `kind` | text | `guarded`, future variants |
| `body` | text | |
| `metadata` | jsonb | Optional |

### 3.9 `model_runs`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `created_at` | timestamptz | |
| `analysis_id` | uuid FK **nullable** | For calls not tied to an analysis (e.g. menu route only) |
| `prompt_version` | text **NOT NULL** | See **§3.14** — how values are generated and stored |
| `task_type` | text | `raw_answer`, `claim_extraction`, `evidence_summary`, `rewrite`, `adjudication`, `downstream_copy`, … |
| `provider` | text | `openai`, `anthropic`, `openrouter`, … |
| `model` | text | Resolved model id |
| `latency_ms` | int | |
| `estimated_tokens_in` | int | Nullable / placeholder |
| `estimated_tokens_out` | int | Nullable / placeholder |
| `estimated_cost_usd` | numeric | Nullable / placeholder |
| `status` | text | `success`, `failure` |
| `error_message` | text | Nullable |
| `metadata` | jsonb | Tier chosen, escalation reason, flag types seen, truncated refs |

### 3.10 `reviews` (optional / deferred)

**First pass:** use `analyses.review_*` fields only. Add a dedicated `reviews` table only if you need **history** (multiple events per analysis) or multi-reviewer workflows.

### 3.11 `animoca_tasks`

| Column | Type | Notes |
|--------|------|--------|
| `id` | uuid PK | |
| `created_at`, `updated_at` | timestamptz | |
| `task_type` | text | e.g. `review_flagged_analysis`, `analyst_brief`, `stale_evidence_check`, `digest_weekly` |
| `status` | text | `queued`, `running`, `completed`, `failed`, `cancelled` |
| `analysis_id` | uuid FK nullable | |
| `payload` | jsonb | Inputs |
| `result` | jsonb | Output / brief |
| `scheduled_for` | timestamptz | Nullable |
| `metadata` | jsonb | |

### 3.12 Canonical storage: `guarded_response` vs `rewrites`

**Decision (v1):**

| Role | Location | Rule |
|------|----------|------|
| **Canonical guarded text** | `rewrites` | Exactly **one** row per persisted analysis with `kind = 'guarded'` and `body` = the final guarded string returned to the client. Future variants (e.g. A/B prompts, alternate tones) use **additional** rows with different `kind` or `metadata.variant` — not overwriting the canonical row without an explicit migration/versioning policy. |
| **Denormalized mirror** | `analyses.guarded_response` | **Same string** as `rewrites.body` for that analysis. Written in the **same database transaction** as the `rewrites` insert so list/detail queries on `analyses` do not require a join. If ever inconsistent during debugging, **trust `rewrites`** as canonical and treat `analyses.guarded_response` as a cache to repair. |
| **Raw answer** | `analyses.raw_response` only for v1 | Optional later: `rewrites` with `kind = 'raw'` if you need multiple raw revisions; not required for MVP parity. |

**Uniqueness:** `UNIQUE (analysis_id, kind)` on `rewrites` where `kind = 'guarded'` is the enforced primary guarded artifact (partial unique index *or* enforce in application + plain unique on `(analysis_id, kind)` if all kinds are single-version per analysis).

### 3.13 Query-only analyses: `sources` vs `query_text`

**Decision:**

- **Default (query-only demo/dashboard today):** **Do not** create a `sources` row. Store the user text **only** in `analyses.query_text`. Leave **`analyses.source_id` null**.
- **Rationale:** Avoids noise rows, simplifies persistence, matches mental model (“the query is the input”).
- **When to create `sources`:** When the product flow supplies a **distinct artifact** (uploaded PDF, scraped URL, label OCR text, brochure blob, pasted marketing copy **as** the evaluated corpus). Then insert `sources` with the appropriate `source_type` (`pdf`, `url`, `manual_input` for pasted non-query copy, etc.) and set `source_id` on the analysis (and optionally on claims).
- **`manual_input`:** Reserved for **explicit** pasted/uploaded **source document** text **not** reducible to the single short `query_text` field, not for “user typed a question in the box.”

### 3.14 `prompt_version` on `model_runs` (generation & storage)

**Single column:** use **`prompt_version`** (text, NOT NULL). Do not rely on separate `prompt_id` unless you later add a `prompts` registry table.

**How it is generated (implementation contract):**

1. **Primary (recommended):** Central **prompt registry** in code (e.g. `engine/prompts/registry.ts` or constants next to each caller) mapping each logical prompt to a **stable human-readable key**, e.g. `longevity.raw_answer@v1`, `claims.extract@v2`, `rewrite.guarded@v1`, `downstream.menu@v1`.
2. **Bump rule:** When any system prompt text **materially** changes, increment the version suffix (`v1` → `v2`) or the middle segment so `model_runs` time series stays interpretable.
3. **Optional forensic hash:** In `model_runs.metadata`, store `prompt_sha256` (hash of UTF-8 system prompt string at runtime) to detect drift if someone edits code without bumping the key. The **stored `prompt_version`** remains the registry key for dashboards and cost attribution.
4. **Downstream routes** (menu/product): each gets its own registry key (e.g. `downstream.product_copy@v1`).
5. **If a call site forgets a key:** Router should **default** to `unknown.<task_type>` only in development or throw in CI — production policy is team choice; document prefer **fail loud in tests** + required key for merge.

**Storage:** Every `model_runs` row sets `prompt_version` **before** the provider call (or on enqueue) so failed runs still record which prompt was attempted.

### 3.15 Indexes and uniqueness (migration targets)

**`claims`**

- `UNIQUE (analysis_id, claim_index)` — one row per slot in `AnalyzeResponse.claims` order.
- `INDEX (analysis_id)` — list claims for an analysis.
- Optional: `INDEX (product_id)`, `INDEX (source_id)` where non-null (analytics).

**`sources`**

- `INDEX (source_type)` — filter by type.
- `INDEX (content_hash)` WHERE `content_hash IS NOT NULL` — dedup / “have we seen this label before”.
- **Do not** require global `UNIQUE (content_hash)` until product rules are clear (hash collisions vs intentional re-use). Revisit when deduping uploads.

**`evidence_entries`**

- `CREATE UNIQUE INDEX … ON evidence_entries (lower(trim(intervention)))` — curated map: one canonical row per intervention string (matches seed import). *If* you later allow duplicate intervention labels with different provenance, drop uniqueness and use `(provenance, slug)` instead; for v1 seed, the unique normalized intervention is intentional.
- `INDEX (evidence_label)` — optional analytics.
- `INDEX (updated_at)` — stale-evidence sweeps (Animoca / cron).

**`claim_evidence_links`**

- `UNIQUE (claim_id, evidence_entry_id, link_type)` — idempotent links; same triple not inserted twice.
- `INDEX (evidence_entry_id)` — reverse lookup “which claims touched this entry”.

**`model_runs`**

- `INDEX (analysis_id, created_at DESC)` — timeline per analysis.
- `INDEX (task_type, created_at DESC)` — cost / usage by task.
- `INDEX (status, created_at DESC)` — operational monitoring.
- Optional: `INDEX ((metadata->>'tier'))` only if Postgres version/jsonb indexing justified later.

**`animoca_tasks`**

- `INDEX (status, scheduled_for)` WHERE `status = 'queued'` AND `scheduled_for IS NOT NULL` — worker pickup (partial index).
- `INDEX (analysis_id)` — tasks for an analysis.
- `INDEX (task_type, status)` — queue depth by type.
- **Uniqueness:** Generally **no** global unique on `(task_type, analysis_id)` — you may want **multiple** tasks over time (e.g. recurring digests). Optional **application-level** dedupe for “same pending brief not enqueued twice” can use a partial unique index only if you define a narrow idempotency key (e.g. `(task_type, analysis_id) WHERE status = 'queued'`); **defer** until enqueue semantics are fixed.

**`evidence_flags`**

- `INDEX (analysis_id)` — all flags for a run.
- `INDEX (analysis_id, claim_index)` — flags per claim slot.
- Optional: `INDEX (flag_type)`, `INDEX (severity)` — dashboards.

**`rewrites`**

- `UNIQUE (analysis_id, kind)` — aligns with §3.12 single canonical `guarded` row per analysis (if you add multi-version history later, relax to non-unique + `version` column or use `kind` values like `guarded@2025-04-01`).

---

## 4. Model router — escalation design (not a name switch)

The router is **two layers**:

1. **Resolution:** map `(task_type, tier_hint)` → `(provider, model)` from env/config (supports single-provider fallback).
2. **Escalation policy:** adjust tier using **explicit rules** before resolution.

### 4.1 Config surface (conceptual; implement as TS + env)

```text
confidence_thresholds    # e.g. min parser confidence to stay on cheap tier (placeholders until signals exist)
risk_thresholds        # e.g. max coherence_score drop, min flags, specific flag severity scores
escalate_if_flag_types # list: if any flag type in this set → minimum reasoning tier (or premium for adjudication-only tasks)
force_reasoning_or_premium_for_high_risk
                         # boolean + definitions: e.g. coherence below X, or adjudication task, or N severe flags
default_fallback         # if premium/reasoning model missing → downgrade to available tier with metadata flag `downgraded: true`
```

### 4.2 Escalation flow (conceptual)

1. Determine **base tier** from `task_type` (e.g. `claim_extraction` → cheap, `rewrite` → reasoning, `adjudication` → premium).
2. Compute **risk signals** from in-run data: `evidence_flags` types, `coherence_score`, count of claims, optional future parser confidence.
3. If signals hit `risk_thresholds` or `escalate_if_flag_types` → bump tier (cheap → reasoning; reasoning → premium only for `adjudication` or explicit high-risk cases).
4. **Resolve model:** if target tier’s model unset → **default_fallback** (use single configured model; log `model_runs.metadata.downgrade_reason`).
5. Execute provider call; record **`model_runs`** including `prompt_version` (§3.14), `status`, tokens/cost placeholders.

### 4.3 Task → default tier (initial mapping)

| task_type | Default tier |
|-----------|----------------|
| `raw_answer` | cheap (or reasoning if product policy demands—configurable) |
| `claim_extraction` | cheap |
| `evidence_summary` | cheap / reasoning (configurable) |
| `rewrite` | reasoning |
| `adjudication` | premium |
| Downstream menu/product | cheap or reasoning (match current quality; default to same as today) |

Premium **must not** be required for the app to run: if only one model is configured, all tiers collapse to that model with clear logging.

---

## 5. Animoca Analyst — role and boundaries

**Not in scope for synchronous analyze:** no blocking call to Animoca Minds inside `analyze()`.

**Near-term responsibilities (scaffolding + DB only):**

| Responsibility | Implementation direction |
|----------------|---------------------------|
| Review flagged analyses | Worker/cron or manual trigger creates `animoca_tasks` with `task_type=review_flagged_analysis`; payload includes `analysis_id`, flag summary. |
| Generate analyst briefs from completed analyses | `buildAnalystBrief(analysisId)` in `lib/animoca/analyst-service.ts` — reads persisted rows, returns structured JSON/text; optionally stores in `animoca_tasks.result`. |
| Queue follow-up tasks | Insert `animoca_tasks` when `needs_followup` or `review_status=needs_followup`; no fake HTTP client. |
| Monitor stale evidence or unresolved claims | Scheduled task type `stale_evidence_check` — compares `evidence_entries.updated_at` or policy; future logic. |
| Daily/weekly digests | Task types `digest_daily` / `digest_weekly` + payload date range; **later** wire to email/Telegram/webhook. |

**Explicit non-goals:** Inventing SDKs, mock “Animoca API” clients, or putting agent latency inside user-facing analyze.

---

## 6. API layer — thin routes

| Responsibility | Where it lives |
|----------------|----------------|
| Parse/validate HTTP body | Route handler (minimal) |
| Run analysis + optional persist | **`runAnalysis` / `AnalysisService`** in `lib/analysis/` (or `server/services/`) |
| Map DB IDs / products / sources | Service + repository |
| Return `NextResponse.json(analyzeResponse)` | Route handler |

**Rule:** `app/api/analyze/route.ts` should not grow large blocks of insert logic; repositories (`lib/persistence/analysis-repository.ts`) own SQL/Supabase calls.

### 6.1 Persistence gating (`EIE_PERSIST_ANALYSIS`)

**Goal:** Analysis always returns the same `AnalyzeResponse` to the client; persistence must **never** break the request path during rollout or env misconfiguration.

| Condition | Behavior |
|-----------|----------|
| `EIE_PERSIST_ANALYSIS` **off** / unset | **Skip persistence silently** (no logs required). Identical to pre-persistence MVP. |
| Flag **on** but Supabase env **missing** or invalid (e.g. no `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) | **Log a server-side warning** (once per request or throttled—implementation choice), **skip persistence**, **do not throw** on the hot path. Return the normal analyze JSON. |
| Flag **on** and env **present** | Run repository writes after a successful `analyze()`. If a write fails, **log** the error and still return the analyze JSON (additive persistence; user-visible outcome unchanged unless you later add strict mode). |

This avoids hard failures when someone enables the flag before pasting keys, or typo’s the URL.

---

## 7. Phase-by-phase implementation plan (revised)

| Phase | Focus | Outcome |
|-------|--------|---------|
| **1** | Migration map & schema review | This document; team alignment (no code required). |
| **2** | Supabase foundation | Migrations for **products**, **sources**, **analyses** (with FKs + review columns), **claims**, **evidence_entries** (structured), **claim_evidence_links**, **evidence_flags**, **rewrites**, **model_runs** (full audit columns), **animoca_tasks**; typed server client; `.env.local.example` update. |
| **3** | Thin analysis service + repositories | New `lib/analysis/run-analysis.ts` (or similar) wrapping existing `analyze()`; `lib/persistence/*` with feature flag `EIE_PERSIST_ANALYSIS`; **route only calls service**. Gating: **§6.1** (flag off → silent skip; flag on + missing env → warn + skip, **no throw** on hot path). |
| **4** | Engine service split | Re-home modules per Phase 1 mapping; behavior unchanged; tests/manual checklist against golden flows. |
| **5** | Model router + escalation | Config + `model_runs` logging; single-model fallback identical to current behavior. |
| **6** | Persistence completeness | Persist product/source when provided; claims, flags, rewrites, links to `evidence_entries` when matcher resolves; jsonb for PubMed/study blobs on analysis if still denormalized. |
| **7** | Evidence seed script | Map JSON → **structured** `evidence_entries` + `raw_payload`; keep JSON runtime fallback until verified. |
| **8** | Animoca Analyst scaffolding | `lib/animoca/*`, task enqueue helpers, brief builder from persisted analysis; **no** external integration. |
| **9** | Review UX (optional) | Surface `review_status` on dashboard if needed; still additive. |
| **10** | Hardening | Parity pass, observability dashboards later, README architecture section. |

**Suggested commit order (when coding):** Phase 2 migration → client → Phase 3 service + repo (flag off) → Phase 4 split → Phase 5 router → Phase 6 persist depth → Phase 7 seed → Phase 8 Animoca lib → Phase 9–10.

### 7.1 Golden parity / regression checklist (after Phase 4 engine split + Phase 5 model router)

Run this checklist whenever the orchestrator, policy engine, rewrite path, or router defaults change. **Pass criteria:** outputs match the **golden reference** (current MVP) within normal LLM variance where applicable; deterministic steps (flags, scores, scope gates) should match **exactly** for the same inputs.

**Scope & evidence map (no LLM variance)**

- [ ] Query with **no** intervention in map → same out-of-scope / not-in-map branch as today (messages unchanged or intentionally reviewed).
- [ ] Query matching **each** of several interventions → still in scope; `isQueryInScope` semantics preserved.
- [ ] `loadEvidenceMap` / matcher: same entries considered for a fixed query string as before refactor.

**Deterministic pipeline (fix seed / mock LLM for strict checks if needed)**

- [ ] For a **frozen raw_response** fixture: **same** `extractedClaims` shape after claim-parser move (or accept documented parser version bump only if prompts unchanged).
- [ ] **Same** `evidence_flags` set (type, claim_index, message, penalty) for frozen claims + map.
- [ ] **Same** `coherence_score` for a given flag list.
- [ ] Scope-short-circuit paths: **no** LLM calls when out of map / out of scope (verify via mock or call count).

**Rewrite & guarded output (LLM variance)**

- [ ] With **production prompts and model** unchanged: side-by-side spot check on **3–5 canonical queries** (e.g. fasting, metformin, NMN); guarded tone and structure substantially aligned with pre-refactor runs (document any intentional prompt change separately).
- [ ] Dashboard still renders raw vs guarded, flags, and score without console errors.

**API contracts**

- [ ] `POST /api/analyze` response JSON keys unchanged; types still satisfy `AnalyzeResponse`.
- [ ] `includePubmed: true` and `false` both behave as before (PubMed + claim study blocks when enabled).
- [ ] `POST /api/claim-studies`, `menu-description`, `product-description` unchanged in request/response shape.

**Model router (Phase 5)**

- [ ] With **only** `OPENAI_API_KEY` and **no** tier-specific env models: every task uses the **same** default model as today (`gpt-4o-mini` or current default); `model_runs.metadata` records `downgraded` / `single_model_fallback` as designed.
- [ ] With reasoning/premium env vars unset: **no** new failures and **no** behavior change vs single model.
- [ ] Optional: with mocked provider, verify escalation only changes **model string** / tier metadata, not response schema.

**Persistence (if flag on — Phase 6+)**

- [ ] `rewrites` canonical `guarded` body **equals** `analyses.guarded_response` after insert.
- [ ] `evidence_flags` rows: `claim_index` aligns with persisted `claims.claim_index` and API order.

---

## 8. Deliverables checklist (updated)

| # | Deliverable |
|---|-------------|
| 1 | Phase 1 migration map (§1) — file→service, shape→table, sync/async, risk |
| 2 | Revised schema outline (§3), indexes (§3.15), guarded canonical (§3.12), query-only sources (§3.13), prompts (§3.14) |
| 3 | Router escalation design (§4) |
| 4 | Thin routes + persistence ownership (§6) |
| 5 | Simplified review on `analyses` (§3.3, §7) |
| 6 | Animoca Analyst scope (§5) |
| 7 | Golden reference (§0) |
| 8 | Migrations + seed script + README when implementation starts |
| 9 | Parity checklist (§7.1) after engine/router phases |

---

## 9. First implementation step (proposal — after plan approval)

**Step 1:** Add Supabase dependency, `lib/supabase/server.ts`, and **one initial migration** that creates **all tables in §3** with enums/constraints as needed—including **`products`**, **`sources`**, structured **`evidence_entries`**, and full **`model_runs`** columns—plus `.env.local.example` entries. **Do not** wire reads/writes into the engine yet; merge should keep `npm run build` green and MVP unchanged.

This establishes the **contract with the database** early (product/source-aware, structured evidence, auditable runs) before touching orchestration or behavior.

---

## Appendix — Quick reference: current repo layout

| Area | Role |
|------|------|
| `app/api/analyze/route.ts` | POST analyze → `analyze()` today |
| `engine/index.ts` | Orchestrator |
| `engine/*` | Parser, map, policy, rewrite, score, LLM |
| `lib/pubmed.ts`, `lib/study-search.ts` | External APIs |
| `components/demo`, `components/dashboard` | UI |
| `data/evidence_map.json` | Curated seed |

*(Full HTTP/engine flows preserved from earlier revision; they are unchanged in behavior—see §1.3 for synchronous boundaries.)*
