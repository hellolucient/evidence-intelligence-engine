/* eslint-disable no-console */

/**
 * EIE smoke / parity checks (Phase 10). Lightweight — no test runner.
 *
 * Prerequisites:
 *   - Dev server running (default http://127.0.0.1:3000 for `npm run dev`)
 *   - OPENAI_API_KEY in the server's environment
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3000 npm run smoke
 *
 * Persistence + DB coherence (server must also have EIE_PERSIST_ANALYSIS=true and Supabase env):
 *   EIE_PERSIST_ANALYSIS=true NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   BASE_URL=... npm run smoke
 *
 * All POST API surfaces (extra LLM + network calls):
 *   SMOKE_API_SURFACES=all BASE_URL=... npm run smoke
 */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";

const ANALYZE_CORE_KEYS = [
  "raw_response",
  "guarded_response",
  "claims",
  "evidence_flags",
  "coherence_score",
];

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = "SmokeCheckError";
    throw err;
  }
}

function printRuntimeHints() {
  console.log("\n-- EIE smoke environment (this shell) --");
  console.log(`BASE_URL: ${BASE_URL}`);
  console.log(`EIE_PERSIST_ANALYSIS: ${process.env.EIE_PERSIST_ANALYSIS || "(unset)"}`);
  console.log(`EIE_ENQUEUE_ANIMOCA_TASKS: ${process.env.EIE_ENQUEUE_ANIMOCA_TASKS || "(unset)"}`);
  console.log(
    `SMOKE_API_SURFACES: ${process.env.SMOKE_API_SURFACES || "(unset — analyze + optional DB only)"}`
  );
  console.log(
    "\nNote: For persistence checks, the **server** must use the same EIE_PERSIST_ANALYSIS and Supabase env vars."
  );
}

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, text, json };
}

function validateAnalyzeShape(json) {
  assert(json && typeof json === "object", "Response is not JSON object");
  for (const k of ANALYZE_CORE_KEYS) {
    assert(k in json, `Missing key: ${k}`);
  }
  assert(typeof json.raw_response === "string", "raw_response must be string");
  assert(typeof json.guarded_response === "string", "guarded_response must be string");
  assert(Array.isArray(json.claims), "claims must be array");
  assert(Array.isArray(json.evidence_flags), "evidence_flags must be array");
  assert(typeof json.coherence_score === "number", "coherence_score must be number");
}

async function checkAnalyzeScenario(name, body, opts = {}) {
  console.log(`\n== ${name} ==`);
  const { res, text, json } = await postJson("/api/analyze", body);
  assert(res.status === 200, `Expected 200, got ${res.status}: ${text.slice(0, 200)}`);
  validateAnalyzeShape(json);

  const keys = Object.keys(json).sort();
  console.log(`status: ${res.status}`);
  console.log(`keys: ${keys.join(",")}`);
  console.log(`claims: ${json.claims.length} flags: ${json.evidence_flags.length} score: ${json.coherence_score}`);

  if (opts.expectPubmedSummary === true) {
    assert("pubmed_summary" in json, "Expected pubmed_summary key present");
    assert(json.pubmed_summary && typeof json.pubmed_summary === "object", "pubmed_summary must be object");
  }
  if (opts.expectPubmedSummary === false) {
    assert(!("pubmed_summary" in json), "Did not expect pubmed_summary key");
  }

  return json;
}

function validateClaimStudiesShape(json) {
  assert(json && typeof json === "object", "claim-studies: not an object");
  assert(typeof json.rct_count === "number", "claim-studies: rct_count must be number");
  assert(typeof json.meta_analysis_count === "number", "claim-studies: meta_analysis_count must be number");
  assert(Array.isArray(json.studies), "claim-studies: studies must be array");
}

async function checkClaimStudies(claimText, originalQuery) {
  console.log("\n== claim-studies (shape) ==");
  const { res, text, json } = await postJson("/api/claim-studies", {
    claimText,
    originalQuery,
  });
  assert(res.status === 200, `claim-studies: expected 200, got ${res.status}: ${text.slice(0, 200)}`);
  validateClaimStudiesShape(json);
  console.log(`studies: ${json.studies.length} rct_count: ${json.rct_count}`);
}

function validateDescriptionsResponse(json, label) {
  assert(json && typeof json === "object", `${label}: not an object`);
  assert(Array.isArray(json.descriptions), `${label}: descriptions must be array`);
  assert(json.descriptions.length === 3, `${label}: expected 3 descriptions`);
  for (const d of json.descriptions) {
    assert(typeof d === "string" && d.trim().length > 0, `${label}: each description must be non-empty string`);
  }
}

async function checkMenuDescription(guardedOutput, originalQuery) {
  console.log("\n== menu-description (shape) ==");
  const { res, text, json } = await postJson("/api/menu-description", {
    guardedOutput,
    originalQuery,
  });
  assert(res.status === 200, `menu-description: expected 200, got ${res.status}: ${text.slice(0, 200)}`);
  validateDescriptionsResponse(json, "menu-description");
}

async function checkProductDescription(guardedOutput, originalQuery) {
  console.log("\n== product-description (shape) ==");
  const { res, text, json } = await postJson("/api/product-description", {
    guardedOutput,
    originalQuery,
  });
  assert(res.status === 200, `product-description: expected 200, got ${res.status}: ${text.slice(0, 200)}`);
  validateDescriptionsResponse(json, "product-description");
}

async function verifyPersistenceCoherence(client, queryPrefix, apiSnapshot) {
  const { data: analysisRows, error: aErr } = await client
    .from("analyses")
    .select("id, raw_response, guarded_response, coherence_score, query_text")
    .ilike("query_text", `${queryPrefix}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  assert(!aErr, `(persistence) supabase error: ${aErr?.message || "unknown"}`);
  assert(analysisRows && analysisRows.length > 0, "(persistence) no analyses row found for smoke query");

  const analysisId = analysisRows[0].id;
  const row = analysisRows[0];

  assert(row.raw_response === apiSnapshot.raw_response, "(persistence) raw_response mismatch");
  assert(row.guarded_response === apiSnapshot.guarded_response, "(persistence) guarded_response mismatch");
  assert(row.coherence_score === apiSnapshot.coherence_score, "(persistence) coherence_score mismatch");

  const { count: claimCount, error: cErr } = await client
    .from("claims")
    .select("id", { count: "exact", head: true })
    .eq("analysis_id", analysisId);
  assert(!cErr, `(persistence) claims count error: ${cErr?.message}`);
  assert(
    claimCount === apiSnapshot.claims.length,
    `(persistence) claims count ${claimCount} !== API ${apiSnapshot.claims.length}`
  );

  const { count: flagCount, error: fErr } = await client
    .from("evidence_flags")
    .select("id", { count: "exact", head: true })
    .eq("analysis_id", analysisId);
  assert(!fErr, `(persistence) flags count error: ${fErr?.message}`);
  assert(
    flagCount === apiSnapshot.evidence_flags.length,
    `(persistence) evidence_flags count ${flagCount} !== API ${apiSnapshot.evidence_flags.length}`
  );

  const { data: rewrites, error: rErr } = await client
    .from("rewrites")
    .select("id, kind, body")
    .eq("analysis_id", analysisId);
  assert(!rErr, `(persistence) rewrites error: ${rErr?.message}`);
  assert(rewrites && rewrites.length === 1, `(persistence) expected 1 rewrite row, got ${rewrites?.length ?? 0}`);
  assert(rewrites[0].kind === "guarded", "(persistence) rewrite kind must be guarded");
  assert(rewrites[0].body === apiSnapshot.guarded_response, "(persistence) rewrite body mismatch");

  const { data: claimIdRows } = await client.from("claims").select("id").eq("analysis_id", analysisId);
  const claimIds = claimIdRows?.map((c) => c.id).filter(Boolean) ?? [];
  let linkCount = 0;
  if (claimIds.length > 0) {
    const { count, error: lErr } = await client
      .from("claim_evidence_links")
      .select("id", { count: "exact", head: true })
      .in("claim_id", claimIds);
    assert(!lErr, `(persistence) claim_evidence_links count error: ${lErr?.message}`);
    linkCount = count ?? 0;
  }
  console.log(`(persistence) claim_evidence_links: ${linkCount} (informational)`);

  console.log("\n(persistence) coherence OK for analysis_id:", analysisId);
}

async function maybeCheckPersistence(queryPrefix, apiSnapshot) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const persistFlag = process.env.EIE_PERSIST_ANALYSIS?.trim().toLowerCase();

  if (persistFlag !== "true" && persistFlag !== "1" && persistFlag !== "yes") {
    console.log("\n(persistence) skipped: EIE_PERSIST_ANALYSIS not true in this shell (coherence not run)");
    return;
  }
  if (!url || !key) {
    console.log("\n(persistence) skipped: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in this shell");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });

  await verifyPersistenceCoherence(client, queryPrefix, apiSnapshot);
}

async function main() {
  printRuntimeHints();

  const inScopeNoPubmed = await checkAnalyzeScenario(
    "in-scope (includePubmed false)",
    { query: "Does metformin extend lifespan?", includePubmed: false },
    { expectPubmedSummary: false }
  );

  await checkAnalyzeScenario(
    "out-of-scope (includePubmed false)",
    { query: "What is the capital of France?", includePubmed: false },
    { expectPubmedSummary: false }
  );

  await checkAnalyzeScenario(
    "in-scope (includePubmed true)",
    { query: "What does intermittent fasting do for longevity?", includePubmed: true },
    { expectPubmedSummary: true }
  );

  await checkAnalyzeScenario(
    "default includePubmed omitted (route defaults true)",
    { query: "Is rapamycin promising for lifespan extension?" },
    { expectPubmedSummary: true }
  );

  const persistQueryPrefix = `EIE smoke persist ${Date.now()}`;
  const persistSnapshot = await checkAnalyzeScenario(
    "persistence trigger (includePubmed false)",
    { query: `${persistQueryPrefix}: Does metformin extend lifespan?`, includePubmed: false },
    { expectPubmedSummary: false }
  );
  await maybeCheckPersistence(persistQueryPrefix, persistSnapshot);

  if (process.env.SMOKE_API_SURFACES === "all") {
    const claimText =
      inScopeNoPubmed.claims[0]?.claim_text || "Metformin may affect longevity-related pathways.";
    await checkClaimStudies(claimText, "Does metformin extend lifespan?");
    await checkMenuDescription(inScopeNoPubmed.guarded_response, "Does metformin extend lifespan?");
    await checkProductDescription(inScopeNoPubmed.guarded_response, "Does metformin extend lifespan?");
  } else {
    console.log("\n(SMOKE_API_SURFACES) skipped: set SMOKE_API_SURFACES=all to exercise claim-studies + copy routes");
  }

  console.log("\nOK: EIE smoke checks passed");
}

main().catch((err) => {
  console.error("\nFAILED:", err?.message || err);
  process.exit(1);
});
