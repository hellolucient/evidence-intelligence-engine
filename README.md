# Evidence Intelligence Engine (EIE)

Domain-specific evidence calibration for longevity and biohacking-related AI outputs. Given a user query, the system generates a raw LLM response, extracts claims, cross-references a curated evidence map, detects certainty mismatches, and returns a guarded response plus an Evidence Coherence Score.

## Stack

- **Next.js 14** (App Router) – API, dashboard, and demo app
- **TypeScript** (strict)
- **Engine** – pure TS modules under `engine/` (claim extraction, evidence map, certainty rules, rewrite, scoring)
- **LLM** – OpenAI by default; swappable via `engine/llm/provider.ts`
- **Evidence map** – `data/evidence_map.json` (editable)

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

**POST** `/api/analyze`

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

## Project structure

```
app/                 # Next.js App Router
  api/analyze/       # POST /api/analyze
  dashboard/         # Full transparency view
  page.tsx           # Demo longevity AI (guarded only)
engine/              # Core evidence intelligence
  claim-extractor.ts
  certainty-alignment.ts
  coherence-score.ts
  evidence-map.ts
  rewrite-engine.ts
  llm/provider.ts
  types.ts
  index.ts           # Orchestrator
data/
  evidence_map.json  # Curated interventions (edit here)
lib/
  pubmed.ts          # Optional PubMed E-utilities
components/
  dashboard/
  demo/
```

## Deploy

- **Vercel:** Connect the repo and set `OPENAI_API_KEY` in project environment. No extra config.
- **Docker:** Use a Node image, `npm run build` and `npm start` (or add a `Dockerfile` as needed).

## Extending

- **Evidence map:** Edit `data/evidence_map.json`; add interventions and adjust evidence tiers.
- **LLM:** Implement `LLMProvider` in `engine/llm/provider.ts` and pass it into `analyze(..., { llm })`.
- **Rules:** Adjust penalties and conditions in `engine/certainty-alignment.ts`.
