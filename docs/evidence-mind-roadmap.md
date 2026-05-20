# lucient Evidence Mind Roadmap

**Living document.** Update this file before and after every implementation phase.  
**Related:** [Stage 1 architecture/privacy gap report](./stage-1-architecture-privacy-gap-report.md) · [EIE v2 upgrade plan](./EIE-v2-upgrade-plan.md) · [Animoca Minds discovery — repo inventory](./animoca-minds-discovery.md)

**Last updated:** 2026-05-20

---

## 1. Product Direction

The Evidence Intelligence Engine (EIE) is evolving from a **one-off wellness claim checker** into:

**lucient Evidence Mind: a persistent evidence memory layer for the wellness industry.**

Today, a user submits a query and receives a guarded analysis. Tomorrow, the product should remember **evidence-aligned judgment** across time—while keeping each client’s creative and commercial IP inside a **private workspace**.

The intended model:

- **One shared Evidence Mind** — global evidence intelligence, risk classifications, claim categories, and compliance principles that improve over time.
- **Multiple private client workspaces** — each company’s jurisdiction, brand voice, treatment menu, product claims, approved/rejected language, uploaded documents, review history, and generated copy stay isolated.
- **No cross-client creative reuse** — one client’s menu copy, campaign drafts, or rewrites must never inform another client’s output.
- **Shared learning is semantic, not stylistic** — the platform may learn that a class of claim is high-risk in a jurisdiction; it must not learn *how Client A phrases* a benefit and reuse that phrasing for Client B.
- **Animoca Minds compatibility by design** — the product should be structured so a Mind can become the central operating layer, but the exact Animoca Minds technical integration must be validated before deep implementation.

**The shared Evidence Mind learns what claims mean, not how clients say them.**

Near-term users still get fast analyze → flags → rewrite. Long-term users get a **durable evidence memory**: what was approved, what was rejected, what patterns recur, and what the shared layer knows about claim *meaning*—without leaking proprietary wording across tenants.

---

## 2. Current Starting Point

Summary from Stage 1 inspection ([full report](./stage-1-architecture-privacy-gap-report.md)):

| Area | Current state |
|------|----------------|
| **App** | Next.js 14 (App Router) wellness/longevity **claim checker** |
| **Main API** | `POST /api/analyze` — query → raw answer → claims → flags → score → guarded rewrite |
| **Evidence** | Runtime reads `data/evidence_map.json`; optional `evidence_entries` in Supabase (seed only, not hot path) |
| **Pipeline** | Claim extraction (LLM), risk/policy scoring (deterministic rules), rewrite (LLM) |
| **Persistence** | Optional Supabase (`EIE_PERSIST_ANALYSIS`) — analyses, claims, flags, rewrites, links, `model_runs` |
| **Mind scaffold** | Optional `animoca_tasks` enqueue + Resend email brief/send to shared Mind inbox |
| **Other routes** | `claim-studies`, `menu-description`, `product-description`, `animoca/brief`, `animoca/send` |
| **Workspace model** | **None** — no `client`, `workspace`, or `tenant` tables or API fields |
| **Auth** | **None** — API routes are open at the application layer |
| **RLS** | **None** — migrations have no row-level security policies |
| **Tenant isolation** | **None** — service-role Supabase client can read/write all rows |
| **Data partitioning** | **None** — no private-vs-global classification; all persisted analyses share one table space |
| **Animoca Minds integration** | **Not confirmed** — current repo has email/task scaffolding only; no confirmed Minds API client, webhook, tool-calling interface, memory sync, or workspace permission model |

**Operational mitigations today (not architectural):** persistence, Animoca enqueue, and auto-email are **off by default**; engine runs without a database.

---

## 3. Core Architecture Target

```txt
                    ┌─────────────────────────────────────┐
                    │     Shared Evidence Mind (global)    │
                    │  evidence_entries, risk rules,       │
                    │  claim-type semantics, public corpus │
                    │  anonymised patterns (Phase 6+, opt) │
                    └──────────────┬──────────────────────┘
                                   │ read-only / aggregates
         ┌─────────────────────────┼─────────────────────────┐
         ▼                         ▼                         ▼
  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │ Workspace A  │        │ Workspace B  │        │ Workspace C  │
  │ (private)    │        │ (private)    │        │ (private)    │
  │ queries,     │        │ menus,       │        │ documents,   │
  │ rewrites,    │        │ brand voice, │        │ approvals,   │
  │ approvals    │        │ campaigns    │        │ reviewer notes│
  └──────────────┘        └──────────────┘        └──────────────┘
```

### Shared global evidence memory

- Curated intervention evidence (`evidence_entries` / evidence map).
- Policy rules and flag types (lifespan mismatch, causal framing, etc.).
- Public literature references (PubMed, Semantic Scholar) as **non-client** corpus.
- Generic, internally authored rewrite **rules** (not client-specific examples).
- Later: **anonymised** claim-pattern aggregates (Phase 6) — claim type, risk class, jurisdiction sensitivity — **never** client phrasing.

### Private client workspaces

Each workspace owns:

- Analyses, claims, flags, rewrites tied to `workspace_id`.
- Product/source artifacts, uploaded documents, treatment menus.
- Brand voice, approved/rejected language lists, jurisdiction profile.
- Review and approval history, internal reviewer comments.
- Generated menu/product descriptions and campaign drafts.

Workspaces are scoped under a **client** (company) record; settings/profile live on the workspace.

### Optional anonymised pattern learning

- Exporter runs only after privacy review and explicit phase approval.
- Client and enterprise opt-out flags.
- Allowed fields documented; prohibited fields enforced by tests.
- No export of raw query text, claim_text, guarded_response, or rewrite bodies.

### Future similarity / originality safety check

- Cross-workspace check returns **pass/fail or risk score only** — never source content.
- Generation retrieval remains **workspace-only**; similarity blocks or regenerates unsafe rewrites.

### Future Animoca / Minds integration

The product should be designed so Animoca Minds can become a central operating layer, but deep integration must wait until the real Animoca Minds technical model is confirmed.

Current known state:

- The repo has `animoca_tasks`, brief generation, and email sending.
- There is no confirmed Animoca Minds API client.
- There is no confirmed webhook integration.
- There is no confirmed Mind tool-calling interface.
- There is no confirmed memory sync mechanism.
- There is no confirmed permission/workspace model for client-private data.

Possible future integration models:

1. **EIE calls a Mind**  
   EIE performs analysis, then sends a brief/task to an Evidence Mind. This is closest to the current email/task scaffold, but it risks making the Mind look like a sidecar.

2. **Mind calls EIE as a tool**  
   User interacts with the Evidence Mind; the Mind calls EIE APIs/tools to analyze claims. This is likely stronger for the Animoca thesis because the Mind becomes the front door.

3. **Evidence Mind is the product layer; EIE is the engine**  
   The Mind owns the persistent relationship, memory, workflow, and client context. EIE becomes the evidence-analysis engine behind it. This is the preferred strategic direction, subject to technical validation.

Until Animoca Minds developer documentation or direct technical guidance is confirmed, all Minds integration work must be treated as assumption-based.

---

## 4. Non-Negotiable Privacy Rules

These rules apply to all phases unless explicitly revised in the Decision Log with a documented reason.

| Rule | Detail |
|------|--------|
| **Client raw content is private** | Queries, uploads, source text, and original LLM answers belong to the workspace. |
| **Client rewrites are private** | Guarded outputs and downstream menu/product copy are workspace data. |
| **Client brand voice is private** | Tone, lexicon, and style guides are not shared across tenants. |
| **Client approval history is private** | Review status, notes, reviewer identity, and approval/rejection decisions stay in the workspace. |
| **No client creative wording for another client** | No retrieval, few-shot examples, or templates sourced from another workspace’s text. |
| **No shared rewrite library from client content** | Do not build a global store of client-generated rewrites for reuse. |
| **Global evidence/risk rules may be shared** | Policy outcomes, flag types, evidence tiers, and intervention semantics are shareable. |
| **Public evidence sources may be shared** | PubMed, guidelines, and curated `evidence_entries` are global. |
| **Generic internally authored rewrite rules may be shared** | System prompts and calibration rules written by lucient—not copied from any client. |
| **External Mind handoff must be explicit** | Private client content must not be sent to any external Mind, inbox, API, or operator workflow without a defined workspace policy and approval mode. |

**Prohibited without explicit opt-in and legal review:** using client menu descriptions, treatment names, product concepts, campaign drafts, uploaded documents, brand voice, generated rewrites, approval history, or internal reviewer comments to generate content for other clients.

---

## 5. Phase Plan

### Phase 0 — Roadmap and Control Document

**Goal:** Create this living roadmap and use it as the source of truth for what to build and in what order.

**Status:** In progress

**Tasks:**

- [x] Create `docs/evidence-mind-roadmap.md`
- [x] Record Stage 1 findings (link: [stage-1-architecture-privacy-gap-report.md](./stage-1-architecture-privacy-gap-report.md))
- [x] Define phases
- [x] Define decision log
- [x] Define task status format (see §8)
- [x] Add Animoca Minds discovery phase and integration assumptions

**Exit criteria:** Roadmap reviewed; Phase A and Phase 1 not started until explicitly instructed.

---

### Phase A — Animoca Minds Discovery

**Goal:** Understand how Animoca Minds actually works technically before wiring it deeply into the product.

**Status:** In progress

**Why this phase exists:**  
The product strategy depends on making a Mind central, but the current repo only has a basic email/task scaffold. Before building around Animoca Minds, we need to confirm whether Minds can call APIs, receive tasks, store memory, use tools, manage permissions, or operate as the product front door.

**Tasks:**

- [x] Inventory current repository scaffold and document assumptions (**deliverable:** [`animoca-minds-discovery.md`](./animoca-minds-discovery.md)).
- [ ] Find or request official Animoca Minds developer documentation.
- [ ] Confirm whether Minds supports API calls.
- [ ] Confirm whether Minds supports webhooks.
- [ ] Confirm whether Minds supports email-based task intake.
- [ ] Confirm whether Minds supports Telegram or chat-based task intake.
- [ ] Confirm whether Minds supports file upload or document ingestion.
- [ ] Confirm whether Minds supports persistent memory that can be segmented by client/workspace.
- [ ] Confirm whether Minds can call external tools/APIs such as `/api/analyze`.
- [ ] Confirm whether EIE should call the Mind, the Mind should call EIE, or both.
- [ ] Confirm whether one Evidence Mind can manage many private client workspaces, or whether each client needs a separate Mind instance.
- [ ] Confirm how permissions, secrets, API keys, workspace IDs, and client-private data are handled.
- [ ] Confirm whether Minds can support a redacted/private-content approval workflow.
- [ ] Document the confirmed integration model before implementation (**repo-side inventory done; awaits external Animoca validation**).

**Candidate integration patterns to evaluate:**

| Pattern | Description | Strategic fit | Risk |
|---------|-------------|---------------|------|
| **EIE → Mind** | EIE analyzes, then sends task/brief to a Mind | Easy, close to current scaffold | Mind may look non-central |
| **Mind → EIE tool** | User works with Mind; Mind calls EIE API/tool | Stronger | Requires confirmed tool/API support |
| **Mind as product layer** | Evidence Mind is front door; EIE is behind-the-scenes engine | Strongest | Requires deeper technical integration |
| **Hybrid** | EIE dashboard + Mind workflow coexist | Practical transition | Needs clear privacy boundaries |

**Exit criteria:**  
A short technical note is added to this roadmap or a linked doc confirming:

- selected integration pattern
- required Animoca Minds capabilities
- what is confirmed vs assumed
- what data may leave the workspace boundary
- what implementation phase should handle the first real Minds wiring

---

### Phase 1 — Workspace Data Model Foundation

**Goal:** Add client/workspace concepts without rebuilding the app.

**Status:** Not started

**Tasks:**

- [ ] Add `clients` table
- [ ] Add `client_workspaces` table
- [ ] Add workspace settings/profile structure (jurisdiction, brand voice placeholders, metadata JSON)
- [ ] Add `client_id` / `workspace_id` to private tables (`analyses`, `claims`, `rewrites`, `evidence_flags`, `products`, `sources`, etc.)
- [ ] Add `visibility_scope` / `data_origin` where useful for future export boundaries
- [ ] Keep current app working (nullable FKs or dev defaults during migration)
- [ ] Do **not** add full auth yet unless explicitly approved

**Exit criteria:** Migrations applied; existing analyze flow unchanged; all new columns documented.

---

### Phase 2 — Workspace Context in Runtime Flow

**Goal:** Pass workspace/client context through `/api/analyze` and persistence.

**Status:** Not started

**Tasks:**

- [ ] Update `/api/analyze` to accept `workspaceId` / `clientId` (or headers)
- [ ] Add safe demo workspace fallback for local/dev
- [ ] Persist analyses, claims, rewrites with workspace context
- [ ] Keep existing dashboard/demo UI working
- [ ] Document production requirement: workspace context mandatory when persistence is on

**Exit criteria:** Persisted rows always carry `workspace_id` in production mode; smoke/verify scripts updated.

---

### Phase 3 — Rewrite Privacy Guardrails

**Goal:** Ensure one client’s creative wording cannot be used for another client.

**Status:** Not started

**Tasks:**

- [ ] Update rewrite prompt/policy to forbid cross-client examples
- [ ] Confirm no cross-client retrieval exists in codebase
- [ ] Mark rewrites as private workspace data in schema/docs
- [ ] Ensure no client rewrites enter global examples or shared prompts
- [ ] Document rewrite privacy rules in this roadmap and operator docs

**Exit criteria:** Code review checklist passes; rewrite path uses workspace-only context.

---

### Phase 4 — Auth and Row-Level Security

**Goal:** Make tenant isolation real.

**Status:** Not started

**Tasks:**

- [ ] Decide auth approach (see §9 Open Questions)
- [ ] Add Supabase Auth or chosen auth system
- [ ] Add RLS policies on all workspace-scoped tables
- [ ] Stop unsafe client access patterns (no broad service-role reads from user-facing paths)
- [ ] Verify users can only access their workspace data
- [ ] Review and narrow service-role usage

**Exit criteria:** Penetration-style test: user A cannot read user B’s analysis by ID.

---

### Phase 5 — Safe Animoca / Mind Handoff

**Goal:** Make Mind handoff workspace-aware and privacy-safe after Phase A confirms the actual integration model.

**Status:** Not started

**Dependencies:**

- Phase A must confirm the real Animoca Minds integration surface.
- Phase 1 and Phase 2 should exist so task payloads can be workspace-scoped.
- Phase 3 should exist so rewrites and creative wording are clearly private.

**Tasks:**

- [ ] Add workspace context to `animoca_tasks` payloads.
- [ ] Add redacted / full brief modes.
- [ ] Default to safer/redacted mode for production.
- [ ] Document what gets sent externally, field by field, for each mode.
- [ ] Add approval flow before private content is sent to Mind inbox, API, webhook, or external operator.
- [ ] If Minds can call tools, expose a workspace-scoped EIE tool/API endpoint.
- [ ] If EIE must call Minds, add a dedicated client/module rather than embedding integration logic across routes.
- [ ] If email remains the only integration path, document its limitations and privacy risks.
- [ ] Ensure no private client content is sent to a shared Mind without workspace policy and explicit approval.

**Possible brief modes:**

| Mode | Use case | May include | Must exclude |
|------|----------|-------------|--------------|
| **Redacted** | Production-safe default | claim category, risk type, severity, generic evidence issue, analysis ID, workspace ID hash | raw query, treatment names, exact claim text, rewrite bodies, brand voice |
| **Review** | Human-approved escalation | selected claim text, selected context, guarded output excerpt | unrelated workspace data, full documents unless approved |
| **Full** | Internal/demo only or explicit approval | full analysis package | never default in production |

**Exit criteria:** Production config cannot send full client copy to a Mind, inbox, API, or external operator without explicit approval.

---

### Phase 6 — Anonymised Claim Pattern Learning

**Goal:** Allow the shared Evidence Mind to learn claim *meaning* without storing client wording.

**Status:** Not started

**Tasks:**

- [ ] Define allowed anonymised fields (e.g. claim_type, flag_type, evidence_label, jurisdiction)
- [ ] Define prohibited fields (claim_text, rewrite body, brand terms, etc.)
- [ ] Build exporter only after privacy review sign-off
- [ ] Add client opt-out setting
- [ ] Add enterprise opt-out setting
- [ ] Add tests that original wording is not exported

**Exit criteria:** Exporter unit tests fail if any prohibited field appears in output.

---

### Phase 7 — Similarity / Originality Safety Check

**Goal:** Reduce the risk that generated rewrites resemble protected client content from other workspaces.

**Status:** Not started

**Tasks:**

- [ ] Design cross-workspace similarity check (embeddings or n-gram fingerprint — TBD)
- [ ] Ensure API returns only pass/fail or risk score — never source content or workspace identity
- [ ] Regenerate rewrite if similarity exceeds threshold
- [ ] Keep generation retrieval workspace-only

**Exit criteria:** Similarity service audited; no content leakage in responses or logs.

---

### Phase 8 — Evidence Mind Product Layer

**Goal:** Turn the engine into a persistent Evidence Mind product.

**Status:** Not started

**Tasks:**

- [ ] Add workspace dashboard
- [ ] Add client evidence memory view (history, trends)
- [ ] Add approved/rejected claim memory
- [ ] Add jurisdiction profile UI
- [ ] Add brand voice profile UI
- [ ] Add risk digest (scheduled or on-demand)
- [ ] Add evidence passport concept (exportable compliance artifact — scope TBD)
- [ ] Add recurring review workflows
- [ ] Align UI language with the selected Animoca Minds integration model from Phase A

**Exit criteria:** Workspace user can see their memory without seeing other tenants; shared layer visible only as generic intelligence.

---

## 6. Immediate Next Step

Phase A (**Animoca Minds Discovery**) is **in progress**.

**Repo inventory:** see [`animoca-minds-discovery.md`](./animoca-minds-discovery.md) for what exists today versus what Animoca still must confirm.

**Next substantive step:** obtain official Animoca Minds technical guidance (APIs, webhooks, tools, intake channels, tenancy/memory — see Phase A checklist and §9).

Do **not** implement Phase 1 until explicitly instructed.

Before continuing any phase, update §8 Task Tracker and follow §10 Cursor/Codex Working Rule.

---

## 7. Decision Log

| Date | Decision | Reason | Status |
|------|----------|--------|--------|
| 2026-05-16 | Use one database with client/workspace separation | Simpler ops than per-tenant DBs initially; RLS + `workspace_id` enforces isolation; dedicated DBs remain an enterprise option | Accepted |
| 2026-05-16 | Shared Mind learns claim meaning, not client wording | Core IP/confidentiality principle; aligns with product positioning | Accepted |
| 2026-05-16 | Do not use client rewrites to generate other clients’ rewrites | Prevents creative cross-contamination and regulatory/reputational risk | Accepted |
| 2026-05-16 | Start with roadmap before implementation | Stage 1 found no tenant model; need agreed phases and privacy rules before schema/code changes | Accepted |
| 2026-05-16 | Add Animoca Minds Discovery before deep integration | Current repo has only task/email scaffold; real Minds API/tool/memory model is not yet confirmed | Accepted |
| 2026-05-16 | Preferred strategic model is “Mind as product layer, EIE as engine” | Best fit for requirement that a Mind be central, not merely one tool in the kit | Tentative pending Phase A |

---

## 8. Task Tracker

**Statuses:** `Not started` · `In progress` · `Done` · `Blocked` · `Deferred`

| Phase | Task | Status | Notes |
|-------|------|--------|-------|
| 0 | Create `docs/evidence-mind-roadmap.md` | Done | This document |
| 0 | Record Stage 1 findings | Done | [stage-1-architecture-privacy-gap-report.md](./stage-1-architecture-privacy-gap-report.md) |
| 0 | Define phases | Done | §5 |
| 0 | Define decision log | Done | §7 |
| 0 | Define task status format | Done | §8 header |
| 0 | Add Animoca Minds discovery phase | Done | Phase A added before implementation phases |
| A | Repository scaffold inventory (Phase A discovery) | Done | [`animoca-minds-discovery.md`](./animoca-minds-discovery.md) |
| A | Find/request official Animoca Minds developer documentation | Not started | Required before deep integration |
| A | Confirm Minds API support | Not started | |
| A | Confirm webhook support | Not started | |
| A | Confirm email/task intake support | In progress | EIE can emit email + DB tasks outbound; Animoca ingestion of that channel not confirmed ([discovery doc](./animoca-minds-discovery.md)) |
| A | Confirm Telegram/chat intake support | Not started | |
| A | Confirm file/document ingestion support | Not started | |
| A | Confirm persistent memory and workspace segmentation | Not started | Critical for client-private model |
| A | Confirm whether Mind can call `/api/analyze` as a tool | Not started | Important for Mind-as-front-door model |
| A | Decide likely integration pattern | In progress | **Preliminary (code today):** EIE → Mind push; strategic “Mind-as-layer” awaits Animoca capabilities |
| A | Document confirmed vs assumed integration details | In progress | Repo-side capture in discovery doc; **external confirmations still open** |
| 1 | Add `clients` table | Not started | Awaiting explicit Phase 1 approval |
| 1 | Add `client_workspaces` table | Not started | |
| 1 | Add workspace settings/profile structure | Not started | |
| 1 | Add `client_id` / `workspace_id` to private tables | Not started | |
| 1 | Add `visibility_scope` / `data_origin` where useful | Not started | |
| 1 | Keep current app working | Not started | |
| 1 | Defer full auth unless approved | Not started | |
| 2 | Update `/api/analyze` for workspace context | Not started | |
| 2 | Demo workspace fallback | Not started | |
| 2 | Persist with workspace context | Not started | |
| 2 | Keep existing UI working | Not started | |
| 2 | Document production workspace requirement | Not started | |
| 3 | Update rewrite prompt/policy | Not started | |
| 3 | Confirm no cross-client retrieval | Not started | |
| 3 | Mark rewrites private in schema/docs | Not started | |
| 3 | Block client rewrites in global examples | Not started | |
| 3 | Document rewrite privacy rules | Not started | |
| 4 | Decide auth approach | Not started | See §9 |
| 4 | Implement auth | Not started | |
| 4 | Add RLS policies | Not started | |
| 4 | Remove unsafe access patterns | Not started | |
| 4 | Verify workspace-only access | Not started | |
| 4 | Review service-role usage | Not started | |
| 5 | Workspace context on Animoca tasks | Not started | Depends on Phase A |
| 5 | Redacted / full brief modes | Not started | |
| 5 | Production default to safer mode | Not started | |
| 5 | Document external send payload | Not started | |
| 5 | Approval flow before Mind send | Not started | |
| 5 | Build confirmed Minds integration path | Not started | API/webhook/email/tool path TBD |
| 6 | Define allowed anonymised fields | Not started | |
| 6 | Define prohibited fields | Not started | |
| 6 | Build exporter (post privacy review) | Not started | |
| 6 | Client opt-out setting | Not started | |
| 6 | Enterprise opt-out setting | Not started | |
| 6 | Tests: no wording export | Not started | |
| 7 | Design similarity check | Not started | |
| 7 | Pass/fail or score only API | Not started | |
| 7 | Regenerate on high similarity | Not started | |
| 7 | Workspace-only generation retrieval | Not started | |
| 8 | Workspace dashboard | Not started | |
| 8 | Client evidence memory view | Not started | |
| 8 | Approved/rejected claim memory | Not started | |
| 8 | Jurisdiction profile UI | Not started | |
| 8 | Brand voice profile UI | Not started | |
| 8 | Risk digest | Not started | |
| 8 | Evidence passport concept | Not started | |
| 8 | Recurring review workflows | Not started | |
| 8 | Align UI with confirmed Minds model | Not started | Depends on Phase A |

---

## 9. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | **What auth approach should be used?** (Supabase Auth, Clerk, custom JWT, SSO for enterprise) | Phase 4 design |
| 2 | **Should enterprise clients have dedicated databases later?** | Hosting cost, isolation strength, migration path |
| 3 | **What should the default anonymised-learning setting be?** (opt-in vs opt-out) | Phase 6 compliance and sales |
| 4 | **What exactly should be included in a redacted Animoca/Mind brief?** | Phase 5 payload spec |
| 5 | **Should similarity checking be required before any generated rewrite is shown?** | Phase 7 UX and latency |
| 6 | **Should workspace setup be manual at first or self-serve?** | Phase 1–2 onboarding and admin tooling |
| 7 | **Does Animoca Minds provide an API, webhook, or tool-calling interface?** | Phase A / Phase 5 |
| 8 | **Can a Mind call our EIE `/api/analyze` endpoint as a tool?** | Determines whether Mind can be front door |
| 9 | **Can a single Mind manage many client workspaces safely?** | Core product architecture |
| 10 | **How does Animoca Minds persistent memory work?** | Determines whether memory lives in Minds, EIE, or both |
| 11 | **Can Mind memory be segmented by client/workspace?** | Critical privacy requirement |
| 12 | **What content can be safely sent to a Mind under Animoca’s infrastructure?** | Legal/privacy review |
| 13 | **Does Minds support file uploads or document ingestion?** | Treatment menu/workspace document workflows |
| 14 | **Should EIE expose tools to the Mind, or should EIE send briefs to the Mind?** | Integration design |
| 15 | **Is the default `evidence.intelligence.engine@amind.ai` recipient an automated Mind intake, a shared ops mailbox, or both?** | Validates whether outbound Resend is a supported integration primitive |
| 16 | **Should `animoca_tasks` rows be coupled to Animoca infra, or remain an internal EIE operator/worker queue?** | Naming implies Mind alignment; today there is **no repo consumer** of queued tasks |

Record answers in the Decision Log when resolved.

---

## 10. Cursor/Codex Working Rule

**Before implementing any future phase**, update this roadmap with:

- The phase being started (set phase status in §5 if helpful)
- The exact tasks being attempted (§8 → `In progress`)
- Any assumptions (add to Decision Log or phase notes)
- Any files expected to change (bullet list under the phase or in task Notes)

**After implementing any future phase**, update this roadmap with:

- Files changed (list paths)
- Tasks completed (§8 → `Done`)
- Tests/checks run (`npm run lint`, `npm run build`, `npm run smoke`, migrations, etc.)
- Remaining gaps (honest list)
- Next recommended step (usually §6)

**Do not start a phase without updating this document first.** If work diverges from the plan, log the decision in §7 before continuing.

For Animoca Minds-related work:

- Do not assume API/webhook/tool-calling support unless confirmed.
- Do not send private client content to a Mind, inbox, API, webhook, or external service without an explicit workspace policy and approval path.
- Do not implement deep Minds integration until Phase A has produced a confirmed technical model.
- Keep the product architecture compatible with “Mind as product layer, EIE as engine,” unless Phase A proves that model is not technically viable.

---

## Document history

| Date | Change |
|------|--------|
| 2026-05-16 | Initial roadmap created from Stage 1 report and lucient Evidence Mind strategic direction |
| 2026-05-16 | Added Animoca Minds Discovery phase, integration assumptions, Minds-related open questions, and safety rules |
| 2026-05-20 | Phase A started (`In progress`); added [`animoca-minds-discovery.md`](./animoca-minds-discovery.md) (repo inventory); updated §6, §8–§9; preliminary integration-pattern note (EIE→Mind from current scaffold) |
