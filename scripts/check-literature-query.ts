/**
 * Query-builder checks (no network). Run with: npx tsx scripts/check-literature-query.ts
 */
import {
  buildClaimPubMedQuery,
  buildPubMedQueryFromSlots,
  buildTopicPubMedQuery,
  extractPrimarySubject,
  hasDistinctInterventionClass,
  heuristicSearchSlots,
  resolveInterventionClass,
} from "../lib/literature-query";
import { buildRawAnswerUserMessage } from "../engine/services/answer-prompt";

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

const hbotQuery =
  "hyberbaric chamber treatment wil Strengthen immune system and energy levels Promote anti-aging, collagen synthesis and skin glow";
assert(
  extractPrimarySubject(hbotQuery).toLowerCase() === "hyperbaric chamber",
  `HBOT subject should be hyperbaric chamber, got "${extractPrimarySubject(hbotQuery)}"`
);
const hbotSlots = heuristicSearchSlots(hbotQuery);
assert(
  hbotSlots.intervention.toLowerCase() === "hyperbaric chamber",
  `HBOT heuristic intervention, got "${hbotSlots.intervention}"`
);
assert(
  hbotSlots.outcomes.some((outcome) => outcome.includes("immune") || outcome.includes("collagen")),
  `HBOT heuristic outcomes ${hbotSlots.outcomes}`
);

const hbotSlotsExact = {
  intervention: "hyperbaric chamber",
  intervention_class: "hyperbaric oxygen therapy",
  outcomes: ["immune system", "energy levels", "collagen synthesis"],
  frame: "claim" as const,
  outcome_is_broad: false,
};
assert(resolveInterventionClass("hyperbaric chamber") === "hyperbaric oxygen therapy", "chamber class");
assert(hasDistinctInterventionClass(hbotSlotsExact), "chamber has a distinct class");
assert(hbotSlots.intervention_class === "hyperbaric oxygen therapy", "heuristic sets HBOT class");

const hbotFromSlots = buildPubMedQueryFromSlots(hbotSlotsExact);
const hbotClass = buildPubMedQueryFromSlots(hbotSlotsExact, "class");
const hbotNarrow = buildPubMedQueryFromSlots(hbotSlotsExact, "specific");
assertIncludes(hbotClass, "hbot", "class grain uses HBOT");
assertIncludes(hbotClass, "hyperbaric oxygen", "class grain uses hyperbaric oxygen");
assertNotIncludes(hbotClass, '"hyperbaric chamber"[tiab]', "class grain does not require the chamber phrase");
assertIncludes(hbotNarrow, "hyperbaric chamber", "narrow grain keeps the chamber");
assertIncludes(hbotNarrow, "mild hyperbaric", "narrow grain includes mild chambers");
assertNotIncludes(hbotNarrow, "hbot[tiab]", "narrow grain does not expand to HBOT");
assertNotIncludes(hbotNarrow, '"hyperbaric oxygen"[tiab]', "narrow grain does not expand to HBOT oxygen");

const answerGrounding = buildRawAnswerUserMessage(hbotQuery, hbotSlotsExact);
assertIncludes(answerGrounding, "hyperbaric chamber", "answer prompt keeps the chamber");
assertIncludes(answerGrounding, "hyperbaric oxygen therapy", "answer prompt names the class");
assertIncludes(answerGrounding, "both grains", "answer prompt asks for both grains");
assertIncludes(hbotFromSlots, "hbot", "HBOT query uses HBOT acronym");
assertIncludes(hbotFromSlots, "hyperbaric oxygen", "HBOT query uses hyperbaric oxygen");
assertIncludes(hbotFromSlots, "fatigue", "energy levels maps to fatigue");
assertIncludes(hbotFromSlots, "immune", "immune system maps to immune");
assertIncludes(hbotFromSlots, "collagen", "collagen synthesis maps to collagen");
assertNotIncludes(hbotFromSlots, '"energy levels"[tiab]', "do not AND quoted consumer energy phrasing");
assertNotIncludes(hbotFromSlots, '"immune system"[tiab]', "do not AND quoted consumer immune phrasing");
assertNotIncludes(hbotFromSlots, '"hyperbaric chamber"[tiab] AND', "subject must be an OR of HBOT synonyms, not the chamber phrase alone");

const hbotTopic = buildTopicPubMedQuery(hbotQuery);
assertIncludes(hbotTopic, "hbot", "HBOT topic from raw misspelled query");
assertIncludes(hbotTopic, "hyperbaric oxygen", "HBOT topic synonyms");

console.log("literature-query checks passed");
console.log("  tea topic:", teaTopic);
console.log("  scent claim:", claimQuery);
console.log("  lavender claim:", lavenderClaim);
console.log("  redlight topic:", redlightTopic);
console.log("  melatonin claim:", melatoninClaim);
console.log("  redlight slots:", redlightSlots);
console.log("  slot-driven claim:", slotDrivenClaim);
console.log("  hbot slots:", hbotSlots);
console.log("  hbot from slots:", hbotFromSlots);
console.log("  hbot class:", hbotClass);
console.log("  hbot narrow:", hbotNarrow);
console.log("  hbot topic:", hbotTopic);
