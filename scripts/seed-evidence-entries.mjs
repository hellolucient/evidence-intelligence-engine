import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(v).trim();
}

function canonicalizeIntervention(intervention) {
  return String(intervention ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKey(intervention) {
  return canonicalizeIntervention(intervention).toLowerCase();
}

async function findEvidenceEntryIdByIntervention(supabase, intervention) {
  const canonical = canonicalizeIntervention(intervention);

  // Prefer exact match first.
  const { data: exact } = await supabase
    .from("evidence_entries")
    .select("id")
    .eq("intervention", canonical)
    .maybeSingle();
  if (exact?.id) return exact.id;

  // Case-insensitive fallback (covers most “unique index on lower(trim())” conflicts).
  const { data: ci } = await supabase
    .from("evidence_entries")
    .select("id")
    .ilike("intervention", canonical)
    .maybeSingle();
  return ci?.id ?? null;
}

async function upsertEvidenceEntry(supabase, jsonEntry) {
  const intervention = canonicalizeIntervention(jsonEntry.intervention);
  if (!intervention) return { status: "skipped", reason: "empty_intervention" };

  const payload = {
    intervention,
    evidence_label: jsonEntry.evidence_label,
    human_lifespan_evidence: !!jsonEntry.human_lifespan_evidence,
    human_healthspan_evidence: jsonEntry.human_healthspan_evidence,
    animal_lifespan_evidence: jsonEntry.animal_lifespan_evidence,
    rct_presence: jsonEntry.rct_presence,
    meta_analysis_presence: !!jsonEntry.meta_analysis_presence,
    consensus_guideline: !!jsonEntry.consensus_guideline,
    provenance: "evidence_map_json",
    raw_payload: jsonEntry,
  };

  // First try insert. If the unique index rejects duplicates, fall back to update.
  const { data: inserted, error: insertErr } = await supabase
    .from("evidence_entries")
    .insert(payload)
    .select("id")
    .single();

  if (!insertErr && inserted?.id) {
    return { status: "inserted", id: inserted.id };
  }

  const existingId = await findEvidenceEntryIdByIntervention(supabase, intervention);
  if (!existingId) {
    return {
      status: "failed",
      reason: "insert_failed_and_no_existing_row_found",
      error: insertErr?.message ?? String(insertErr ?? "unknown_error"),
    };
  }

  const { error: updateErr } = await supabase
    .from("evidence_entries")
    .update(payload)
    .eq("id", existingId);

  if (updateErr) {
    return {
      status: "failed",
      reason: "update_failed",
      id: existingId,
      error: updateErr.message,
    };
  }

  return { status: "updated", id: existingId };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage:
  npm run seed:evidence

Required env:
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Reads:
  data/evidence_map.json

Writes (idempotent):
  evidence_entries (insert or update by intervention)
`);
    return;
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const repoRoot = process.cwd();
  const evidencePath = path.join(repoRoot, "data", "evidence_map.json");
  const raw = fs.readFileSync(evidencePath, "utf-8");
  const json = JSON.parse(raw);

  if (!Array.isArray(json)) {
    throw new Error("data/evidence_map.json must be a JSON array");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const seen = new Set();
  const entries = [];
  for (const e of json) {
    const key = normalizeKey(e?.intervention);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(e);
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const res = await upsertEvidenceEntry(supabase, e);
    if (res.status === "inserted") inserted++;
    else if (res.status === "updated") updated++;
    else if (res.status === "skipped") skipped++;
    else failed++;

    if ((i + 1) % 10 === 0 || i === entries.length - 1) {
      console.log(
        `[seed:evidence] ${i + 1}/${entries.length} processed (inserted=${inserted}, updated=${updated}, skipped=${skipped}, failed=${failed})`
      );
    }

    if (res.status === "failed") {
      console.error("[seed:evidence] failed:", {
        intervention: canonicalizeIntervention(e?.intervention),
        reason: res.reason,
        error: res.error,
      });
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[seed:evidence] fatal:", err);
  process.exitCode = 1;
});

