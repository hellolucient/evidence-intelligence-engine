# Evidence Intelligence Engine (EIE) v0.1

## Cursor Build Prompt -- Longevity Evidence Intelligence Layer

You are an expert full-stack architect and AI systems engineer.

Your task is to design and scaffold a production-ready MVP called:

**Evidence Intelligence Engine (EIE)**

This is a domain-specific evidence calibration engine for longevity and
biohacking-related AI outputs.

The system must be modular, extensible, and structured for future
enterprise deployment.

------------------------------------------------------------------------

# 1. Core Objective

Given a longevity-related user query, the system must:

1.  Generate a raw LLM response.
2.  Extract discrete factual claims from that response.
3.  Classify claim types (mechanistic, biomarker, lifespan outcome,
    healthspan outcome, etc.).
4.  Cross-reference claims against a curated evidence map.
5.  Detect certainty mismatches and extrapolation inflation.
6.  Optionally query PubMed for RCT/meta-analysis presence.
7.  Rewrite the response to align certainty with evidence strength.
8.  Compute an Evidence Coherence Score (0--100).
9.  Return:
    -   Raw response
    -   Guarded response
    -   Structured evidence analysis
    -   Evidence Coherence Score

------------------------------------------------------------------------

# 2. System Requirements

## A. Architecture

Design a modular architecture with:

-   Engine layer (core evidence intelligence logic)
-   API layer (REST or RPC endpoint)
-   Dashboard interface (diff + transparency view)
-   Demo Longevity AI app (guarded output only)

System must support: - Swappable LLM providers (OpenAI, Anthropic,
etc.) - Configurable evidence map - Future enterprise logging and
compliance layers

------------------------------------------------------------------------

# 3. Functional Components

## 3.1 Claim Extraction Module

Input: Raw LLM output\
Output: Structured JSON array of claims

Each claim must include:

-   claim_text
-   claim_type
-   detected_certainty_level (strong, moderate, speculative)

Example output:

``` json
[
  {
    "claim_text": "Cold exposure extends lifespan",
    "claim_type": "lifespan_outcome",
    "detected_certainty_level": "strong"
  }
]
```

Use structured LLM output for extraction.

------------------------------------------------------------------------

## 3.2 Evidence Map

Create a structured JSON evidence map covering 30--50 longevity
interventions including:

-   Fasting
-   Caloric restriction
-   Cold exposure
-   Rapamycin
-   Metformin
-   NAD boosters
-   Senolytics
-   Testosterone optimization
-   Biological age testing

Each intervention must include:

-   human_lifespan_evidence (true/false)
-   human_healthspan_evidence (none/limited/moderate/strong)
-   animal_lifespan_evidence (none/limited/moderate/strong)
-   rct_presence (none/small_trials/multiple_trials)
-   meta_analysis_presence (true/false)
-   consensus_guideline (true/false)
-   evidence_label
    (experimental/emerging/promising/supported/established)

Design evidence_map.json as an editable dataset.

------------------------------------------------------------------------

## 3.3 Certainty Alignment Detector

Rules-based system:

If claim_type == lifespan_outcome\
AND human_lifespan_evidence == false\
AND detected_certainty_level == strong\
→ Apply certainty mismatch penalty.

Design this as a transparent rule engine.

------------------------------------------------------------------------

## 3.4 Rewrite Engine

Prompt the LLM to rewrite the raw output using:

-   Evidence map data
-   Claim classifications
-   Detected mismatches

Constraints: - No moralizing tone - No medical directives - No
warnings - Purely evidence-calibrated language

------------------------------------------------------------------------

## 3.5 Evidence Coherence Score

Start at 100.

Subtract weighted penalties:

-   Lifespan certainty mismatch: -25
-   Mechanism-to-lifespan extrapolation: -15
-   Unsupported causal framing: -20
-   Minor certainty inflation: -10

Return final score.

------------------------------------------------------------------------

# 4. PubMed Integration (Optional Layer)

Use PubMed E-utilities API.

For detected intervention topics:

Query: - "\[topic\] AND randomized controlled trial" - "\[topic\] AND
meta-analysis" - "\[topic\] AND lifespan"

Return: - Count of RCTs - Count of meta-analyses - Publication volume
last 10 years

Do NOT parse full papers. Display counts only.

PubMed lookup should be triggered optionally (button-based in
dashboard).

------------------------------------------------------------------------

# 5. API Design

Create endpoint:

POST /analyze

Input: { "query": "Should I do a 5-day water fast to extend lifespan?" }

Response: { "raw_response": "...", "guarded_response": "...", "claims":
\[...\], "evidence_flags": \[...\], "coherence_score": 82,
"pubmed_summary": { "rct_count": 3, "meta_analysis_count": 1 } }

------------------------------------------------------------------------

# 6. Dashboard Requirements

Dashboard must include:

-   User Query
-   Raw Output
-   Guarded Output
-   Claims Extracted
-   Evidence Tier Per Claim
-   Certainty Alignment Status
-   Flags Triggered
-   Evidence Coherence Score
-   Transparency Toggle (ON/OFF)
-   PubMed Check Button

Transparency ON: Show full claim + evidence logic.

Transparency OFF: Show raw vs guarded + score only.

------------------------------------------------------------------------

# 7. Demo Longevity AI App

Minimal interface:

-   Input field
-   Guarded response only
-   "Evidence Intelligence Active" badge
-   Optional short evidence summary

No raw output shown.

------------------------------------------------------------------------

# 8. Non-Goals for MVP

Do NOT build:

-   Full literature parsing
-   Study quality grading
-   Clinical guideline interpretation
-   Longitudinal user tracking
-   Crisis routing systems

------------------------------------------------------------------------

# 9. Engineering Goals

System must be:

-   Modular
-   Extensible
-   Production-ready structure
-   Clean separation of concerns
-   Typed where appropriate
-   Easily deployable (Vercel / Docker compatible)
-   Swappable LLM provider abstraction

------------------------------------------------------------------------

# 10. Deliverables

Cursor should:

1.  Propose optimal tech stack.
2.  Scaffold project structure.
3.  Create engine modules.
4.  Create API endpoint.
5.  Create dashboard UI.
6.  Integrate optional PubMed lookup.
7.  Provide local dev instructions.
8.  Prepare for future enterprise extension.

------------------------------------------------------------------------

# Final Instruction

Architect this MVP for clarity, modularity, and extensibility.

Do not overengineer.

Focus on: - Transparent evidence logic - Clean code structure -
Demonstrable differentiation from raw LLM output - Fast iteration
capability

Return proposed stack and scaffolded file structure before implementing.
