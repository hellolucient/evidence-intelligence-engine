/* eslint-disable no-console */

/**
 * Verify a persisted analysis row matches internal child tables (Phase 10).
 * Does not call the API — uses Supabase service role only.
 *
 * Usage (one of):
 *   ANALYSIS_ID=<uuid> node scripts/verify-persistence-coherence.mjs
 *   QUERY_PREFIX="EIE smoke persist" node scripts/verify-persistence-coherence.mjs
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = "CoherenceCheckError";
    throw err;
  }
}

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const analysisIdArg = process.env.ANALYSIS_ID?.trim();
  const queryPrefix = process.env.QUERY_PREFIX?.trim();

  assert(analysisIdArg || queryPrefix, "Set ANALYSIS_ID or QUERY_PREFIX");

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, { auth: { persistSession: false } });

  let analysisId = analysisIdArg;
  if (!analysisId && queryPrefix) {
    const { data, error } = await client
      .from("analyses")
      .select("id")
      .ilike("query_text", `${queryPrefix}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    assert(!error, error?.message || "query failed");
    assert(data?.[0]?.id, `No analysis found for query prefix: ${queryPrefix}`);
    analysisId = data[0].id;
  }

  const { data: analysis, error: aErr } = await client
    .from("analyses")
    .select("id, query_text, raw_response, guarded_response, coherence_score")
    .eq("id", analysisId)
    .single();
  assert(!aErr && analysis, aErr?.message || "analysis not found");

  const { data: claims } = await client.from("claims").select("id").eq("analysis_id", analysisId);
  const { data: flags } = await client.from("evidence_flags").select("id").eq("analysis_id", analysisId);
  const { data: rewrites } = await client.from("rewrites").select("kind, body").eq("analysis_id", analysisId);

  assert(rewrites?.length === 1, `expected 1 rewrite, got ${rewrites?.length ?? 0}`);
  assert(rewrites[0].kind === "guarded", "rewrite kind must be guarded");
  assert(rewrites[0].body === analysis.guarded_response, "rewrite body must match analyses.guarded_response");

  const claimIds = (claims ?? []).map((c) => c.id);
  let linkCount = 0;
  if (claimIds.length > 0) {
    const { count, error: lErr } = await client
      .from("claim_evidence_links")
      .select("id", { count: "exact", head: true })
      .in("claim_id", claimIds);
    assert(!lErr, lErr?.message || "link count failed");
    linkCount = count ?? 0;
  }

  const { count: runCount, error: mErr } = await client
    .from("model_runs")
    .select("id", { count: "exact", head: true })
    .eq("analysis_id", analysisId);
  assert(!mErr, mErr?.message || "model_runs count failed");

  console.log("OK: persistence coherence");
  console.log({
    analysis_id: analysisId,
    query_text: analysis.query_text?.slice(0, 80),
    claims: claims?.length ?? 0,
    evidence_flags: flags?.length ?? 0,
    rewrites: rewrites?.length ?? 0,
    claim_evidence_links: linkCount,
    model_runs_for_analysis_id: runCount ?? 0,
  });
  console.log(
    "(note) model_runs may be 0 for this analysis_id if router calls were logged before analysis id existed — informational only"
  );
}

main().catch((err) => {
  console.error("FAILED:", err?.message || err);
  process.exit(1);
});
