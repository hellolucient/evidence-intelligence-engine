/* eslint-disable no-console */

/**
 * Phase 4 smoke/parity checks (lightweight, no test runner required).
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3001 node scripts/phase4-smoke.mjs
 *
 * Optional persistence verification (requires DB + service key):
 *   EIE_PERSIST_ANALYSIS=true \
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   BASE_URL=http://127.0.0.1:3002 \
 *   node scripts/phase4-smoke.mjs
 */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";

const CORE_KEYS = [
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
  for (const k of CORE_KEYS) {
    assert(k in json, `Missing key: ${k}`);
  }
  assert(typeof json.raw_response === "string", "raw_response must be string");
  assert(typeof json.guarded_response === "string", "guarded_response must be string");
  assert(Array.isArray(json.claims), "claims must be array");
  assert(Array.isArray(json.evidence_flags), "evidence_flags must be array");
  assert(
    typeof json.coherence_score === "number",
    "coherence_score must be number"
  );
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

async function maybeCheckPersistence(expectedQueryPrefix) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.EIE_PERSIST_ANALYSIS) {
    console.log("\n(persistence) skipped: EIE_PERSIST_ANALYSIS not set");
    return;
  }
  if (!url || !key) {
    console.log("\n(persistence) skipped: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in this shell");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await client
    .from("analyses")
    .select("id,query_text,created_at,include_pubmed")
    .ilike("query_text", `${expectedQueryPrefix}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  assert(!error, `(persistence) supabase error: ${error?.message || "unknown"}`);
  assert(data && data.length > 0, "(persistence) no analyses row found for smoke query");

  console.log("\n(persistence) persisted row found:");
  console.log(`analysis_id: ${data[0].id}`);
  console.log(`created_at: ${data[0].created_at}`);
  console.log(`include_pubmed: ${data[0].include_pubmed}`);
}

async function main() {
  console.log(`BASE_URL: ${BASE_URL}`);

  await checkAnalyzeScenario(
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

  const persistQueryPrefix = `Phase4 persist check ${Date.now()}`;
  await checkAnalyzeScenario(
    "persistence trigger (includePubmed false)",
    { query: `${persistQueryPrefix}: Does metformin extend lifespan?`, includePubmed: false },
    { expectPubmedSummary: false }
  );
  await maybeCheckPersistence(persistQueryPrefix);

  console.log("\nOK: Phase 4 smoke checks passed");
}

main().catch((err) => {
  console.error("\nFAILED:", err?.message || err);
  process.exit(1);
});

