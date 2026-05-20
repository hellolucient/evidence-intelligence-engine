# Animoca Minds — Repository discovery note

**Purpose:** Inventory what this repository actually implements toward Animoca/Mind handoff, separate from product strategy documented in [`evidence-mind-roadmap.md`](./evidence-mind-roadmap.md).  
**Scope:** Code and docs only; no external Animoca Minds API confirmation performed here.  
**Date:** 2026-05-20

---

## 1. What Animoca/Mind-related functionality exists

The codebase implements an **operator-oriented “Analyst layer” scaffold**, not an Animoca SDK or bidirectional Mind integration:

- **Internal task queue (`animoca_tasks`)** — Postgres rows describing work items (`review_flagged_analysis`, `analyst_brief`, `stale_evidence_check`, `digest_daily`, `digest_weekly`). Rows are **insert-only from EIE** in the paths reviewed; payloads are summaries or references (e.g. `analysis_id`, flag summaries), not full briefs stored as email bodies by default.
- **Structured analyst brief (`AnalystBrief`)** — Loaded from persisted `analyses`, `claims`, `evidence_flags`, optional product/source contexts, and `claim_evidence_links` / `evidence_entries`.
- **Email brief formatting** — Plain-text brief suitable for humans, branded as EIE analyst review, combining query, raw/guarded LLM outputs, claims, flags, contexts, linked evidence summaries, and “recommended_next_actions” derived in code from review state and flags.
- **Outbound email transport** — [Resend](https://resend.com) sends the formatted brief to a configurable mailbox, default **`evidence.intelligence.engine@amind.ai`** (domain suggests Animoca Mind / shared inbox alignment; **not verified** against official Minds ingestion behavior).
- **Dashboard operator UI** — Generate brief (JSON/HTML fields), copy to clipboard, Send to Mind (calls API routes).
- **Optional automation after analyze+persist** — When env flags allow: enqueue tasks if evidence flags exist; optionally auto-email full brief after persist when flags exist.

There is **no** in-repo consumer that polls `animoca_tasks`, transitions status beyond insert, pushes to Telegram, uploads files to Minds, or syncs Mind memory back into EIE.

---

## 2. Files involved

### Core logic

| Area | Path |
|------|------|
| Task types / brief types | `lib/animoca/analyst-types.ts` |
| Brief assembly from DB | `lib/animoca/brief-builder.ts` |
| Service entrypoints (build brief, enqueue helpers) | `lib/animoca/analyst-service.ts` |
| `animoca_tasks` insert + dedupe | `lib/animoca/task-repository.ts` |
| Email subject/body from brief | `lib/animoca/email-brief.ts` |
| Resend wrapper + sender config | `lib/email/send-resend.ts` |
| Post-persist hooks (enqueue + optional auto-send) | `lib/analysis/run-analysis.ts` |
| Feature flags | `lib/persistence/persist-config.ts` |

### API routes (referenced for behavior only; unchanged in this discovery pass)

| Path | Behavior |
|------|----------|
| `app/api/animoca/brief/route.ts` | `POST` with `analysis_id` → builds brief, returns `subject`, `body_text`, `to`, fragments of brief (does not send) |
| `app/api/animoca/send/route.ts` | Same + `sendEmailViaResend` |

### UI

| Path | Behavior |
|------|----------|
| `components/dashboard/DashboardView.tsx` | “Operator Tools — Animoca Mind”: generate/copy/send |

### Persistence schema (documentation reference only — no migrations in this task)

| Path | Contents |
|------|----------|
| `supabase/migrations/20260419120000_initial_schema.sql` | `animoca_tasks` table (`task_type`, `status`, `analysis_id`, `payload`, `result`, `scheduled_for`, `metadata`, …) |

### Environment / examples

| Path | Variables |
|------|-----------|
| `.env.local.example` | `EIE_ENQUEUE_ANIMOCA_TASKS`, `RESEND_API_KEY`, `EIE_EMAIL_FROM`, `EIE_EMAIL_TO_MIND`, `EIE_EMAIL_ANIMOCA_AFTER_ANALYSIS` (+ persistence vars) |

### Documentation (strategic context, gaps)

| Path | Role |
|------|------|
| `docs/evidence-mind-roadmap.md` | Phase A, Phase 5 handoff targets, Mind-as-layer strategy |
| `docs/stage-1-architecture-privacy-gap-report.md` | Describes full-brief leakage risk via email |
| `docs/EIE-v2-upgrade-plan.md` | Original “Animoca Analyst” scaffolding intent |
| `README.md` | Operator workflow summary, env vars |

---

## 3. Assumptions the current code is making

1. **Mailbox is a valid Mind ingress** — Sending to `@amind.ai` is assumed useful for downstream analyst or Mind ingestion; implementation does not authenticate or confirm delivery semantics with Animoca systems.
2. **Full-content brief is acceptable for the recipient** — The email template includes raw query text, raw model output, full claim text, product/source JSON blobs, guarded response — i.e. **not redacted**. This aligns with Stage 1’s note that defaults are risky for multi-tenant SaaS without policy.
3. **`animoca_tasks` is an internal/async boundary** — Tasks are queued for hypothetical workers or operators; naming signals future Mind alignment but lifecycle is unfinished (no updater in repo).
4. **Single shared recipient** — `EIE_EMAIL_TO_MIND` overrides default; no per-client routing or workspace policy.
5. **Supabase persistence is prerequisite for brief/send** — API routes refuse meaningful work unless Supabase persistence config is present (`hasSupabasePersistenceConfig`).
6. **Truthiness convention for toggles** — `EIE_ENQUEUE_ANIMOCA_TASKS` and `EIE_EMAIL_ANIMOCA_AFTER_ANALYSIS` enabled only when set to `true` / `1` / `yes` (comments say “unset = off”).
7. **Non-blocking/non-fatal failure** — Enqueue failures and optional email failures are logged; they do not fail the analyze response.

---

## 4. Definitely implemented

- Dedup-aware insert into `animoca_tasks` for analysis-scoped task types (`enqueueAnimocaTaskDeduped`).
- Post-persistence enqueue path for **`review_flagged_analysis`** only when `result.evidence_flags.length > 0` **and** `EIE_ENQUEUE_ANIMOCA_TASKS` + persistence enabled — payload summarizes flags and counts.
- Helpers for digest/stale/evidence/`analyst_brief` enqueue (callable from future workers — not wired to cron here).
- `buildAnalystBrief` / `buildAnalystBrief`-backed REST handlers and dashboard UX.
- `formatAnimocaEmailBrief` + Resend integration with **`RESEND_API_KEY`** + **`EIE_EMAIL_FROM`** required for send success.
- Optional auto-email after flagged persist (`EIE_EMAIL_ANIMOCA_AFTER_ANALYSIS`).

---

## 5. Not implemented (in repo)

- Any **Animoca Minds HTTP client**, webhook receiver, JWT/API key handshake, or authenticated API surface.
- **Mind → EIE** initiation (callbacks, subscriptions, MCP/tools calling `/api/analyze`).
- **Worker**, cron job, or server process that consumes `queued` rows, transitions `running`/`completed`, or fills `result`.
- **Structured sync** between Mind-native memory/state and Postgres (no importer/exporter beyond email).
- **Redacted brief modes**, approval workflows, or workspace-aware routing (architecture goals in roadmap Phase 5, not built).
- Telegram/chat intake; file uploads to Mind; ingestion beyond email text.
- **Tests** referencing Animoca pipelines (beyond whatever generic coverage exists elsewhere).

---

## 6. External Animoca Minds capabilities still needing confirmation

This list aligns with Phase A checklist in [`evidence-mind-roadmap.md`](./evidence-mind-roadmap.md):

- Official developer documentation / supported integration surfaces (**API**, **webhooks**, **email intake**, Telegram, dashboards).
- Whether **`evidence.intelligence.engine@amind.ai`** (or successors) receives mail into automations vs human-only inbox.
- **Tool/external API invocation** — Can a Mind call customer-hosted HTTPS endpoints or only internal tools?
- **Persistent memory**: model, tenancy, segmentation by client/workspace vs per-Mind-instance.
- **Security model**: API keys tied to workspaces, SSO, outbound IP allowlisting.
- Whether one Mind deployment can isolate many client workspaces to meet roadmap privacy rules.

---

## 7. Architectural alignment (today’s code vs patterns)

| Pattern | Fit to current repo |
|---------|---------------------|
| **EIE → Mind** | **Strongest fit** — Analysis and persistence occur in EIE; outbound email and DB task rows push toward an external mailbox or future processor. |
| **Mind → EIE** | **Not implemented** — No authenticated entry points or contracts for Mind-leading flows. Would require Animoca-supported tool/API or reverse integration. |
| **Mind as product layer; EIE as engine** | **Strategic direction** per roadmap; **not reflected** in runtime topology — today EIE is the interactive surface + persistence owner. |
| **Hybrid** | **Weak today** — Only “hybrid” in the loose sense that operators may use dashboard while mail lands externally; no coordinated dual control plane. |

**Verdict:** The implemented scaffold is closest to **EIE → Mind** (push sidecar handoff). Evolving toward “Mind as product layer, EIE as engine” depends on Animoca confirming inbound automation + ability for Mind to call EIE securely.

---

## 8. Recommended next investigation step

**Obtain authoritative Animoca Minds integration guidance** (docs or partner engineering): specifically whether production-safe flows require **programmatic APIs/webhooks/tools** versus email-only intake, and whether **Mind-can-call-customer-API** is supported with acceptable auth and data-boundary guarantees. Parallel: confirm routing and retention for the default `@amind.ai` recipient and whether **per-tenant addressing** exists.

Until then, treat the Resend email path as **protocol-uncertain** human/operator escalation, not a confirmed closed-loop Minds integration.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-20 | Initial repository discovery (Phase A inventory, no implementation changes). |
