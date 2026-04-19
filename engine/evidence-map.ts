/**
 * Load and query the curated evidence map.
 */

import type { EvidenceMapEntry } from "./types";

const EVIDENCE_MAP_PATH = "data/evidence_map.json";

let cachedMap: EvidenceMapEntry[] | null = null;

/** Normalize intervention name for matching (lowercase, strip extra spaces). */
function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Load evidence map from JSON. Uses require in Node / readFile in edge as needed.
 * For Next.js we load from filesystem in API route context.
 */
export async function loadEvidenceMap(
  mapPath: string = EVIDENCE_MAP_PATH
): Promise<EvidenceMapEntry[]> {
  if (cachedMap) return cachedMap;
  try {
    const fs = await import("fs");
    const path = await import("path");
    const fullPath = path.join(process.cwd(), mapPath);
    
    // readFileSync will throw if file doesn't exist, so we catch and provide clearer error
    let raw: string;
    try {
      raw = fs.readFileSync(fullPath, "utf-8");
    } catch (readErr) {
      if ((readErr as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Evidence map file not found at: ${fullPath}`);
      }
      throw readErr;
    }
    
    const parsed = JSON.parse(raw) as EvidenceMapEntry[];
    
    if (!Array.isArray(parsed)) {
      throw new Error("Evidence map must be a JSON array");
    }
    
    cachedMap = parsed;
    return parsed;
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Failed to load evidence map: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Find evidence map entry for an intervention (fuzzy match on intervention name).
 */
export function findEntry(
  map: EvidenceMapEntry[],
  interventionHint: string
): EvidenceMapEntry | undefined {
  const normalized = normalize(interventionHint);
  return map.find(
    (e) =>
      normalize(e.intervention) === normalized ||
      normalize(e.intervention).includes(normalized) ||
      normalized.includes(normalize(e.intervention))
  );
}

/**
 * Get all interventions mentioned in text (simple keyword match against map).
 * Handles word variations (e.g., "meditate" matches "meditation").
 */
export function getMentionedInterventions(
  map: EvidenceMapEntry[],
  text: string
): EvidenceMapEntry[] {
  const lower = text.toLowerCase();
  return map.filter((e) => {
    const normalized = normalize(e.intervention);
    // Direct match
    if (lower.includes(normalized)) return true;
    // Word stem matching: check if query contains word stems of intervention
    const interventionWords = normalized.split(/\s+/);
    for (const word of interventionWords) {
      // Match word stems (e.g., "meditate" matches "meditation", "fasting" matches "fast")
      const stem = word.replace(/ing$|tion$|s$/, "");
      if (stem.length >= 4 && lower.includes(stem)) return true;
      // Also check if intervention word is in query as-is
      if (lower.includes(word)) return true;
    }
    return false;
  });
}

/**
 * Check if query relates to interventions in the evidence map.
 * Returns true if at least one intervention is mentioned.
 */
export function isQueryInScope(
  map: EvidenceMapEntry[],
  query: string
): boolean {
  const mentioned = getMentionedInterventions(map, query);
  return mentioned.length > 0;
}
