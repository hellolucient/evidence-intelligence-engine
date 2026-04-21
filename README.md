# Evidence Intelligence Engine (EIE)

Domain-specific evidence calibration for longevity and biohacking-related AI outputs. Given a user query, the system generates a raw LLM response, extracts claims, cross-references a curated evidence map, detects certainty mismatches, and returns a guarded response plus an Evidence Coherence Score.

## Stack

- **Next.js 14** (App Router) – API, dashboard, and demo app
- **TypeScript** (strict)
- **Engine** – pure TS modules under `engine/` (claim extraction, evidence map, certainty rules, rewrite, scoring)
- **LLM** – OpenAI by default; optional tier env vars via `engine/llm/model-router.ts` (single-model fallback matches legacy behavior when unset)
- **Evidence map (runtime)** – `data/evidence_map.json` (editable); the engine reads this file, not Postgres
- **Supabase / Postgres (optional)** – persistence, `model_runs`, and internal `animoca_tasks` queue rows when flags are enabled

## Architecture (current)

| Layer | Role |
|--------|------|
| `app/api/*` | Thin routes; **`/api/analyze`** calls `lib/analysis/run-analysis.ts` then returns JSON unchanged |
| `engine/` | Orchestration (`orchestrator/analyze.ts`), policy, scoring, evidence **JSON** loader, LLM router |
| `lib/persistence/*` | Optional Supabase writes (`analyses`, `claims`, `evidence_flags`, `rewrites`, `claim_evidence_links`, …) |
| `lib/model-runs/*` | Non-fatal audit inserts when persistence flag + Supabase env are on |
| `lib/animoca/*` | **Internal only**: brief builder + `animoca_tasks` enqueue helpers; no external Animoca API, no sync dependency on analyze |

Phases **1–8** of the v2 plan are implemented in-repo (see **[docs/EIE-v2-upgrade-plan.md](docs/EIE-v2-upgrade-plan.md)**). Phase **9** (review UX) is optional; Phase **10** adds smoke/parity tooling and operational clarity without changing API contracts.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | LLM calls |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (server-side persistence) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role for server writes (never expose to the browser) |
| `EIE_PERSIST_ANALYSIS` | When `true` / `1` / `yes`, completed analyses may be persisted and `model_runs` may be logged |
| `EIE_ENQUEUE_ANIMOCA_TASKS` | When set (same truthy rule), best-effort `animoca_tasks` enqueue **after** successful persist (e.g. flagged analyses); failures are non-fatal |
| `RESEND_API_KEY` | Resend API key (server-side email transport for “Send to Mind”) |
| `EIE_EMAIL_FROM` | Email sender for Resend (must be verified with Resend) |
| `EIE_EMAIL_TO_MIND` | Optional override recipient (defaults to `evidence.intelligence.engine@amind.ai`) |
| `EIE_EMAIL_ANIMOCA_AFTER_ANALYSIS` | Optional auto-send email after persistence when evidence flags exist (OFF by default; non-blocking) |
| `EIE_OPENAI_MODEL_CHEAP` / `REASONING` / `PREMIUM` | Optional router tiers; omitted → single default model |
| `PUBMED_EMAIL`, `SEMANTIC_SCHOLAR_API_KEY` | Optional; better limits for literature routes |

Copy **`.env.local.example`** → `.env.local` and fill in secrets.

### Operational commands

```bash
npm run lint          # ESLint
npm run build         # Production build + typecheck

npm run smoke         # Parity: /api/analyze scenarios + optional DB coherence (see script header)
npm run smoke:full    # Also exercises claim-studies, menu-description, product-description (more LLM/network)
npm run smoke:phase4  # Alias for smoke (backward compatible)

npm run seed:evidence # Import data/evidence_map.json → evidence_entries (Supabase)

# Operator: Animoca email workflow (persisted analysis -> email)
# - Generate/Copy: uses Supabase only
# - Send: uses Resend and sends server-side to evidence.intelligence.engine@amind.ai
# Note: you need a persisted analysis_id (see Supabase or server logs).

# After a run, optional DB-only audit:
ANALYSIS_ID=<uuid> npm run verify:persistence
# or: QUERY_PREFIX="EIE smoke persist" npm run verify:persistence
```

**Smoke / persistence:** For DB checks, the **running dev server** must use the same `EIE_PERSIST_ANALYSIS` and Supabase vars as your shell (see `scripts/eie-smoke.mjs`).

### Animoca boundaries

`lib/animoca/*` builds **structured briefs** from persisted rows and can **insert `animoca_tasks`** for later human or system handoff. There is **no** Animoca HTTP client, webhook, or chat UI; enqueue is **off** unless `EIE_ENQUEUE_ANIMOCA_TASKS` is set, and it never blocks the analyze response.

### “Send to Mind” (email)

The dashboard includes operator tools to:
- **Generate Animoca Brief** (subject + plain-text body from persisted analysis)
- **Copy Animoca Brief** (clipboard fallback)
- **Send to Mind** (server-side email via Resend)

This is **separate** from `/api/analyze` and never blocks analysis completion.

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Environment

Copy the example env and set your OpenAI key:

```bash
cp .env.local.example .env.local
# Edit .env.local and set OPENAI_API_KEY=sk-...
```

### 3. Run dev server

```bash
npm run dev
```

- **Demo (guarded only):** [http://localhost:3000](http://localhost:3000)
- **Dashboard (full transparency):** [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

### 4. API

All routes are **POST** and expect JSON unless noted.

#### `/api/analyze`

Main pipeline: raw answer, claims, evidence flags, guarded rewrite, coherence score, optional PubMed summary.

```json
// Request
{ "query": "Should I do a 5-day water fast to extend lifespan?", "includePubmed": false }

// Response
{
  "raw_response": "...",
  "guarded_response": "...",
  "claims": [{ "claim_text": "...", "claim_type": "lifespan_outcome", "detected_certainty_level": "strong" }],
  "evidence_flags": [{ "type": "lifespan_certainty_mismatch", "claim_index": 0, "message": "...", "penalty": 25 }],
  "coherence_score": 82,
  "pubmed_summary": { "rct_count": 3, "meta_analysis_count": 1, "publication_volume_last_10_years": 42 }
}
```

Set `includePubmed: true` to fetch PubMed counts (RCT, meta-analysis, volume). Optional `PUBMED_EMAIL` in `.env.local` for NCBI rate limits.

#### `/api/claim-studies`

Given a single claim plus the original user query, searches PubMed and Semantic Scholar for related RCTs and meta-analyses and returns deduplicated study links (used from the dashboard).

```json
// Request
{ "claimText": "...", "originalQuery": "..." }

// Response
{
  "rct_count": 0,
  "meta_analysis_count": 0,
  "studies": [
    {
      "title": "...",
      "authors": ["..."],
      "year": 2020,
      "journal": "...",
      "url": "...",
      "source": "pubmed",
      "pmid": "..."
    }
  ]
}
```

Optional: `SEMANTIC_SCHOLAR_API_KEY` in `.env.local` for Semantic Scholar (higher rate limits). `PUBMED_EMAIL` helps PubMed E-utilities etiquette.

#### `/api/menu-description` and `/api/product-description`

Downstream copy helpers: they take the **already guarded** text from an analyze run and ask the LLM for three alternative write-ups (spa-style menu blurbs vs retail-safe product copy). They do not re-run the evidence engine; they only paraphrase what is in `guardedOutput`.

```json
// Request (same shape for both routes)
{
  "guardedOutput": "... text from guarded_response ...",
  "originalQuery": "... same user query as /api/analyze ..."
}

// Response
{ "descriptions": ["...", "...", "..."] }
```

## Project structure

```
app/                       # Next.js App Router
  api/
    analyze/               # POST /api/analyze
    claim-studies/         # POST /api/claim-studies
    menu-description/      # POST /api/menu-description
    product-description/   # POST /api/product-description
  dashboard/               # Full transparency + study search + copy helpers
  page.tsx                 # Demo longevity AI (guarded only)
engine/                    # Core evidence intelligence
  claim-extractor.ts
  certainty-alignment.ts
  coherence-score.ts
  evidence-map.ts
  rewrite-engine.ts
  llm/provider.ts
  types.ts
  index.ts                 # Orchestrator
data/
  evidence_map.json        # Curated interventions (edit here)
lib/
  analysis/run-analysis.ts # App entry: engine + optional persistence
  persistence/             # Supabase repositories (feature-flagged)
  model-runs/              # Non-fatal model_runs logging
  animoca/                 # Analyst scaffolding (tasks + briefs; no external API)
  supabase/server.ts       # Service-role client (server only)
  pubmed.ts                # Optional PubMed E-utilities (analyze summary)
  study-search.ts          # PubMed + Semantic Scholar (claim-studies)
  use-analysis-state.ts    # Demo URL/query state
scripts/
  eie-smoke.mjs            # Parity / smoke checks
  verify-persistence-coherence.mjs  # DB-only coherence audit
  seed-evidence-entries.mjs         # evidence_entries import
components/
  dashboard/
  demo/
docs/
  EIE-v2-upgrade-plan.md   # Phased v2 plan and current-state map
```

## Deploy

- **Vercel:** Connect the repo and set `OPENAI_API_KEY` in project environment. No extra config.
- **Docker:** Use a Node image, `npm run build` and `npm start` (or add a `Dockerfile` as needed).

## Extending

- **Evidence map:** Edit `data/evidence_map.json`; add interventions and adjust evidence tiers.
- **LLM:** Implement `LLMProvider` in `engine/llm/provider.ts` and pass it into `analyze(..., { llm })`.
- **Rules:** Adjust penalties and conditions in `engine/certainty-alignment.ts`.
