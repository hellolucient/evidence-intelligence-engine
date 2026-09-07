/**
 * Parse-protocol checks (no network). Run with: npx tsx scripts/check-parse-protocol.ts
 */
import { computeCoherenceScore } from "../engine/services/scoring-service";
import {
  clarifyingQuestionFor,
  enforceProtectedNouns,
  extractProtectedNouns,
  inferObjectKind,
  proseCoversNamedObject,
} from "../engine/services/parse-protocol";
import { heuristicSearchSlots } from "../lib/literature-query";
import { buildUserFindings, formatOutcomeForProse } from "../engine/services/user-findings";
import type { SearchSlots } from "../engine/types";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertIncludes(haystack: string[], needle: string, label: string): void {
  assert(
    haystack.some((item) => item.toLowerCase() === needle.toLowerCase()),
    `${label}: expected ${JSON.stringify(haystack)} to include "${needle}"`
  );
}

const hbotQuery =
  "hyberbaric chamber treatment wil Strengthen immune system and energy levels Promote anti-aging, collagen synthesis and skin glow";

const hbotNouns = extractProtectedNouns(hbotQuery);
assertIncludes(hbotNouns, "chamber", "hyperbaric query protects chamber");
assertIncludes(hbotNouns, "hyperbaric", "hyperbaric query protects hyperbaric");

const hostileHbot: SearchSlots = {
  intervention: "hbot",
  intervention_class: "hyperbaric oxygen therapy",
  outcomes: ["immune system"],
  frame: "claim",
  outcome_is_broad: false,
};
const restored = enforceProtectedNouns(hbotQuery, hostileHbot);
assert(
  restored.intervention.toLowerCase().includes("chamber"),
  `noun lock must restore chamber, got "${restored.intervention}"`
);
assert(
  restored.intervention_class?.toLowerCase().includes("hyperbaric oxygen"),
  `class must remain HBOT, got "${restored.intervention_class}"`
);
assert(restored.object_kind === "equipment", `kind ${restored.object_kind}`);
assert(restored.critic_verdict === "enforced", "hostile parse is marked enforced");
assert(
  (restored.clarifying_question || "").toLowerCase().includes("mild"),
  `mild vs medical question, got "${restored.clarifying_question}"`
);

const heuristic = heuristicSearchSlots(hbotQuery);
const finalizedHeuristic = enforceProtectedNouns(hbotQuery, heuristic);
assert(finalizedHeuristic.intervention.toLowerCase().includes("chamber"), "heuristic keeps chamber");
assert(inferObjectKind(hbotQuery, finalizedHeuristic.intervention) === "equipment", "kind equipment");
assert(clarifyingQuestionFor(hbotQuery, finalizedHeuristic), "clarifying question for HBOT equipment");

assert(
  !proseCoversNamedObject(
    "Hyperbaric oxygen therapy (HBOT) involves breathing pure oxygen in a pressurized environment.",
    "hyperbaric chamber"
  ),
  "HBOT-only prose fails the named-object check"
);
assert(
  proseCoversNamedObject(
    "A hyperbaric chamber is used for hyperbaric oxygen therapy (HBOT).",
    "hyperbaric chamber"
  ),
  "chamber + hyperbaric in prose passes"
);

const teaQuery = "jasmine tea will improve your sleep";
const teaNouns = extractProtectedNouns(teaQuery);
assertIncludes(teaNouns, "jasmine", "tea query protects jasmine");
assertIncludes(teaNouns, "tea", "tea query protects tea");
const hostileTea = enforceProtectedNouns(teaQuery, {
  intervention: "green tea",
  intervention_class: "green tea",
  outcomes: ["sleep"],
  frame: "claim",
  outcome_is_broad: false,
});
assert(
  hostileTea.intervention.toLowerCase().includes("jasmine"),
  `jasmine cannot be replaced by green tea, got "${hostileTea.intervention}"`
);

const redlightQuery =
  "try our redlight therapy bed, you're guaranteed to improve your sleep and feel much better";
const redlight = enforceProtectedNouns(redlightQuery, heuristicSearchSlots(redlightQuery));
assert(redlight.intervention.toLowerCase().includes("red light"), `redlight intervention ${redlight.intervention}`);
assert(redlight.outcomes.includes("sleep"), `redlight outcomes ${redlight.outcomes}`);
assert(!redlight.outcomes.includes("therapy"), "therapy is not an outcome");

const metformin = enforceProtectedNouns(
  "Does metformin extend lifespan?",
  heuristicSearchSlots("Does metformin extend lifespan?")
);
assert(metformin.intervention.toLowerCase() === "metformin", "metformin stays metformin");
assert(
  !clarifyingQuestionFor("Does metformin extend lifespan?", metformin),
  "no equipment fork for metformin"
);

assert(
  computeCoherenceScore([
    {
      type: "unsupported_causal_framing",
      claim_index: 0,
      message: "x",
      penalty: 20,
    },
    {
      type: "class_to_specific_extrapolation",
      claim_index: -1,
      message: "y",
      penalty: 15,
    },
  ]) === 80,
  "ECS ignores class_to_specific_extrapolation"
);

const hbotFindings = buildUserFindings({
  slots: restored,
  literature: {
    pubmed_rct_pool: 54,
    pubmed_meta_pool: 9,
    linked_papers_count: 24,
    claims_searched: 15,
    claims_with_matches: 14,
    unique_claim_papers: 14,
    linked_pubmed_count: 24,
    linked_semantic_scholar_count: 0,
    publication_volume_last_10_years: 0,
    specific_rct_count: 4,
  },
  claimsCount: 6,
});
assert(
  hbotFindings.some((line) => line.toLowerCase().includes("hyperbaric chamber")),
  `findings mention the chamber: ${hbotFindings.join(" | ")}`
);
assert(
  hbotFindings.some((line) => line.toLowerCase().includes("not automatic proof")),
  "findings warn class ≠ equipment"
);
assert(
  !hbotFindings.some((line) => line.includes("unsupported_causal") || line.includes("−20")),
  "findings are not scoring flags"
);
assert(
  hbotFindings.some((line) => /mild consumer chamber/.test(line.toLowerCase()) && /medical/.test(line.toLowerCase())),
  `findings state medical vs mild chamber, got: ${hbotFindings.join(" | ")}`
);
assert(
  !hbotFindings.some((line) => /both grains|this split/i.test(line)),
  "findings do not use split/grains jargon"
);

const questionFindings = buildUserFindings({
  slots: {
    intervention: "metformin",
    outcomes: ["lifespan"],
    frame: "question",
    outcome_is_broad: false,
  },
  claimsCount: 3,
});
assert(
  questionFindings.some((line) => line.toLowerCase().includes("question, not a claim")),
  "question input is labeled as inferred claims"
);
assert(
  questionFindings.some((line) => line.toLowerCase().includes("not from pubmed")),
  "question findings say claims are not from PubMed"
);

const marketingFindings = buildUserFindings({
  slots: {
    intervention: "hyperbaric chamber",
    intervention_class: "hyperbaric oxygen therapy",
    outcomes: ["energy"],
    frame: "marketing",
    outcome_is_broad: false,
  },
  claimsCount: 4,
});
assert(
  marketingFindings.some((line) => line.toLowerCase().includes("inferred from the copy")),
  "marketing findings say claims came from the copy"
);
assert(
  !marketingFindings.some((line) => /unsupported_causal|−20|coherence/i.test(line)),
  "marketing findings are not scoring flags"
);

const liverFlushSlots = heuristicSearchSlots(
  "epsom salt and olive oil liver flush will improve your skin complexion"
);
assert(liverFlushSlots.intervention === "liver flush", `folk parse ${liverFlushSlots.intervention}`);
const liverFlushFindings = buildUserFindings({
  slots: liverFlushSlots,
  literature: {
    pubmed_rct_pool: 0,
    pubmed_meta_pool: 0,
    linked_papers_count: 8,
    claims_searched: 3,
    claims_with_matches: 0,
    unique_claim_papers: 0,
    linked_pubmed_count: 8,
    linked_semantic_scholar_count: 0,
    publication_volume_last_10_years: 0,
    protocol_paper_count: 8,
  },
  claimsCount: 3,
});
assert(
  formatOutcomeForProse("improve skin complexion") === "skin complexion",
  "strip leading improve from outcome prose"
);
assert(
  liverFlushFindings.some((line) => line.toLowerCase().includes("almost no evidence")),
  `folk findings name the empty complexion evidence: ${liverFlushFindings.join(" | ")}`
);
assert(
  liverFlushFindings[0].toLowerCase().includes("almost no evidence"),
  "the takeaway lead is the complexion answer, not context"
);
const doubledOutcomeFindings = buildUserFindings({
  slots: {
    ...liverFlushSlots,
    outcomes: ["improve skin complexion"],
  },
  literature: {
    pubmed_rct_pool: 0,
    pubmed_meta_pool: 0,
    linked_papers_count: 3,
    claims_searched: 1,
    claims_with_matches: 0,
    unique_claim_papers: 0,
    linked_pubmed_count: 3,
    linked_semantic_scholar_count: 0,
    publication_volume_last_10_years: 0,
    protocol_paper_count: 3,
  },
  claimsCount: 1,
});
assert(
  doubledOutcomeFindings[0].includes("improves skin complexion"),
  `stripped verb: ${doubledOutcomeFindings[0]}`
);
assert(
  !doubledOutcomeFindings.some((line) => /improves improve/i.test(line)),
  "no doubled improve"
);
assert(
  liverFlushFindings.some((line) => line.toLowerCase().includes("liver flush")),
  "folk findings keep the protocol name"
);
assert(
  !liverFlushFindings.some((line) => /equipment or product form/i.test(line)),
  "folk findings are not the chamber dual-grain copy"
);

console.log("parse-protocol checks passed");
console.log("  hbot restored:", restored.intervention, "⊂", restored.intervention_class);
console.log("  clarifying:", restored.clarifying_question);
console.log("  tea restored:", hostileTea.intervention);
console.log("  redlight:", redlight.intervention, "→", redlight.outcomes);
