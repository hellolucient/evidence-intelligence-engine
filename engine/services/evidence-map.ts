/**
 * Evidence matcher + evidence source loader (JSON seed for now).
 */

import seedEvidenceMap from "@/data/evidence_map.json";
import { extractPrimarySubject } from "@/lib/literature-query";
import type { EvidenceMapEntry } from "../types";

let cachedMap: EvidenceMapEntry[] | null = null;

/** Normalize intervention name for matching (lowercase, strip extra spaces). */
function normalize(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Load evidence map from bundled JSON seed.
 * Imported at build time so serverless deployments include the dataset.
 */
export async function loadEvidenceMap(): Promise<EvidenceMapEntry[]> {
  if (cachedMap) return cachedMap;

  if (!Array.isArray(seedEvidenceMap)) {
    throw new Error("Failed to load evidence map: seed data must be a JSON array");
  }

  cachedMap = seedEvidenceMap as EvidenceMapEntry[];
  return cachedMap;
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
export function isQueryInScope(map: EvidenceMapEntry[], query: string): boolean {
  const mentioned = getMentionedInterventions(map, query);
  return mentioned.length > 0;
}

export interface QueryScopeAnalysis {
  matchedInterventions: EvidenceMapEntry[];
  primarySubject: string;
  primarySubjectInMap: boolean;
  tangentialMatchOnly: boolean;
}

function primarySubjectMatchesEntry(subject: string, entry: EvidenceMapEntry): boolean {
  const normalizedSubject = normalize(subject);
  const normalizedIntervention = normalize(entry.intervention);
  if (!normalizedSubject) return false;

  return (
    normalizedSubject === normalizedIntervention ||
    normalizedSubject.includes(normalizedIntervention) ||
    normalizedIntervention.includes(normalizedSubject)
  );
}

/**
 * Determine whether scope came from the query's primary subject or only a tangential keyword.
 * e.g. "jasmine tea for sleep" matches sleep optimization via "sleep", not jasmine tea.
 */
export function analyzeQueryScope(
  map: EvidenceMapEntry[],
  query: string
): QueryScopeAnalysis {
  const matchedInterventions = getMentionedInterventions(map, query);
  const primarySubject = extractPrimarySubject(query);

  const primarySubjectInMap =
    !!primarySubject &&
    matchedInterventions.some((entry) => primarySubjectMatchesEntry(primarySubject, entry));

  const tangentialMatchOnly =
    matchedInterventions.length > 0 && !!primarySubject && !primarySubjectInMap;

  return {
    matchedInterventions,
    primarySubject,
    primarySubjectInMap,
    tangentialMatchOnly,
  };
}

