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

console.log("parse-protocol checks passed");
console.log("  hbot restored:", restored.intervention, "⊂", restored.intervention_class);
console.log("  clarifying:", restored.clarifying_question);
console.log("  tea restored:", hostileTea.intervention);
console.log("  redlight:", redlight.intervention, "→", redlight.outcomes);
