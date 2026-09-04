/**
 * Query-builder checks (no network). Run with: npx tsx scripts/check-literature-query.ts
 */
import {
  buildClaimPubMedQuery,
  buildPubMedQueryFromSlots,
  buildTopicPubMedQuery,
  extractPrimarySubject,
  heuristicSearchSlots,
} from "../lib/literature-query";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(haystack: string, needle: string, label: string): void {
  assert(
    haystack.toLowerCase().includes(needle.toLowerCase()),
    `${label}: expected "${haystack}" to include "${needle}"`
  );
}

function assertNotIncludes(haystack: string, needle: string, label: string): void {
  assert(
    !haystack.toLowerCase().includes(needle.toLowerCase()),
    `${label}: expected "${haystack}" not to include "${needle}"`
  );
}

assert(
  extractPrimarySubject("jasmine tea will improve your sleep") === "jasmine tea",
  "jasmine tea subject"
);
assert(
  extractPrimarySubject("What are the benefits of rapamycin?") === "rapamycin",
  "rapamycin subject should skip 'the benefits of'"
);
assert(
  extractPrimarySubject("Does metformin extend lifespan?") === "metformin",
  "metformin subject"
);

const teaTopic = buildTopicPubMedQuery("jasmine tea will improve your sleep");
assertIncludes(teaTopic, "jasmine tea", "tea topic");
assertIncludes(teaTopic, "green tea", "tea synonyms");
assertIncludes(teaTopic, "sleep", "tea outcome");

const claimQuery = buildClaimPubMedQuery(
  "The scent of jasmine may promote relaxation.",
  "jasmine tea will improve your sleep"
);
assertIncludes(claimQuery, "jasmine", "scent claim subject");
assertIncludes(claimQuery, "relaxation", "scent claim outcome");
assertNotIncludes(claimQuery, " AND relaxation[tiab] AND sleep", "outcomes should be OR'd");

const lavenderClaim = buildClaimPubMedQuery(
  "The scent may promote relaxation.",
  "lavender aromatherapy for sleep"
);
assertNotIncludes(lavenderClaim, "jasmine oil", "non-jasmine aroma should not inject jasmine oil");
assertIncludes(lavenderClaim, "aromatherapy", "aroma claim");

const redlightQuery =
  "try our redlight therapy bed, you're guaranteed to improve your sleep and feel much better";
assert(
  extractPrimarySubject(redlightQuery).toLowerCase() === "red light therapy",
  `redlight marketing copy should extract "red light therapy", got "${extractPrimarySubject(redlightQuery)}"`
);
const redlightTopic = buildTopicPubMedQuery(redlightQuery);
assertIncludes(redlightTopic, "red light", "redlight topic");
assertIncludes(redlightTopic, "photobiomodulation", "redlight synonyms");
assertIncludes(redlightTopic, "sleep", "redlight outcome must be sleep, not therapy");
assertNotIncludes(redlightTopic, "try our", "should not search marketing copy");
assertNotIncludes(redlightTopic, "redlight[tiab]", "should not AND the closed compound");
assertNotIncludes(redlightTopic, "pbm[tiab]", "PBM acronym is too ambiguous for PubMed");

const melatoninClaim = buildClaimPubMedQuery(
  "Exposure to red light can promote melatonin production.",
  redlightQuery
);
assertIncludes(melatoninClaim, "red light", "melatonin claim stays about red light");
assertIncludes(melatoninClaim, "melatonin", "melatonin is the outcome");
assertNotIncludes(
  melatoninClaim.split("AND")[0] ?? "",
  "melatonin[tiab]",
  "melatonin must not replace red light as the PubMed subject"
);

const redlightSlots = heuristicSearchSlots(redlightQuery);
assert(
  redlightSlots.intervention.toLowerCase() === "red light therapy",
  `heuristic intervention, got "${redlightSlots.intervention}"`
);
assert(redlightSlots.outcomes.includes("sleep"), `heuristic outcomes ${redlightSlots.outcomes}`);
assert(redlightSlots.frame === "marketing", "redlight pitch is marketing copy");
assert(!redlightSlots.outcome_is_broad, "sleep is a specific outcome");
const fromSlots = buildPubMedQueryFromSlots(redlightSlots);
assertIncludes(fromSlots, "sleep", "slots query includes sleep");
assertNotIncludes(fromSlots, "try our", "slots query strips marketing");

const slotDrivenClaim = buildClaimPubMedQuery(
  "Exposure to red light can promote melatonin production.",
  redlightQuery,
  {
    intervention: "red light therapy",
    outcomes: ["melatonin"],
    frame: "marketing",
    outcome_is_broad: false,
  }
);
assertIncludes(slotDrivenClaim, "melatonin", "slot-driven claim outcome");
assertIncludes(slotDrivenClaim, "photobiomodulation", "slot-driven claim synonyms");

console.log("literature-query checks passed");
console.log("  tea topic:", teaTopic);
console.log("  scent claim:", claimQuery);
console.log("  lavender claim:", lavenderClaim);
console.log("  redlight topic:", redlightTopic);
console.log("  melatonin claim:", melatoninClaim);
console.log("  redlight slots:", redlightSlots);
console.log("  slot-driven claim:", slotDrivenClaim);
