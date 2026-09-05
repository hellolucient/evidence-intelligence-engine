/**
 * Live NCBI checks: topic counts, RCT vs meta-analysis filters, burst load.
 * Run with: npx tsx scripts/check-pubmed-live.ts
 */
import { buildClaimPubMedQuery, buildPubMedQueryFromSlots, buildTopicPubMedQuery, heuristicSearchSlots } from "../lib/literature-query";
import { ncbiEsearch, ncbiEsearchCount } from "../lib/ncbi-eutils";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const query = "jasmine tea will improve your sleep";
  const topic = buildTopicPubMedQuery(query);
  const claim = buildClaimPubMedQuery(
    "The scent of jasmine may promote relaxation.",
    query
  );

  const rctTerm = `(${topic}) AND randomized controlled trial[pt]`;
  const metaTerm = `(${topic}) AND meta-analysis[pt]`;
  const brokenMetaAsRct = `(${topic}) AND meta-analysis[pt] AND randomized controlled trial[pt]`;

  const [rctCount, metaCount, brokenCount, claimRctCount] = await Promise.all([
    ncbiEsearchCount(rctTerm),
    ncbiEsearchCount(metaTerm),
    ncbiEsearchCount(brokenMetaAsRct),
    ncbiEsearchCount(`(${claim}) AND randomized controlled trial[pt]`),
  ]);

  const rctIds = await ncbiEsearch(rctTerm, 5);
  const metaIds = await ncbiEsearch(metaTerm, 5);

  const burst = await Promise.all(
    Array.from({ length: 12 }, () => ncbiEsearchCount(rctTerm))
  );
  const burstZeros = burst.filter((count) => count === 0).length;

  const redlightQuery =
    "try our redlight therapy bed, you're guaranteed to improve your sleep and feel much better";
  const redlightSlots = heuristicSearchSlots(redlightQuery);
  const redlightTopic = buildTopicPubMedQuery(redlightQuery, redlightSlots);
  const redlightRctCount = await ncbiEsearchCount(
    `(${redlightTopic}) AND randomized controlled trial[pt]`
  );
  const redlightMetaCount = await ncbiEsearchCount(
    `(${redlightTopic}) AND meta-analysis[pt]`
  );

  const hbotQuery =
    "hyberbaric chamber treatment wil Strengthen immune system and energy levels Promote anti-aging, collagen synthesis and skin glow";
  const hbotSlots = {
    intervention: "hyperbaric chamber",
    outcomes: ["immune system", "energy levels", "collagen synthesis"],
    frame: "claim" as const,
    outcome_is_broad: false,
  };
  const hbotTopic = buildPubMedQueryFromSlots(hbotSlots);
  const hbotFromRaw = buildTopicPubMedQuery(hbotQuery, heuristicSearchSlots(hbotQuery));
  const hbotRctCount = await ncbiEsearchCount(
    `(${hbotTopic}) AND randomized controlled trial[pt]`
  );
  const brokenHbotRctCount = await ncbiEsearchCount(
    `("hyperbaric chamber"[tiab] AND ("immune system"[tiab] OR "energy levels"[tiab])) AND randomized controlled trial[pt]`
  );

  console.log(
    JSON.stringify(
      {
        topic,
        claim,
        rctCount,
        metaCount,
        brokenMetaAsRctCount: brokenCount,
        claimRctCount,
        rctIds: rctIds.ids.length,
        metaIds: metaIds.ids.length,
        burstZeros,
        burstSample: burst[0],
        redlightTopic,
        redlightRctCount,
        redlightMetaCount,
        hbotTopic,
        hbotFromRaw,
        hbotRctCount,
        brokenHbotRctCount,
      },
      null,
      2
    )
  );

  assert(rctCount > 0, `expected topic RCT count > 0, got ${rctCount}`);
  assert(metaCount > 0, `expected topic meta-analysis count > 0, got ${metaCount}`);
  assert(rctIds.ids.length > 0, "expected RCT PMIDs");
  assert(metaIds.ids.length > 0, "expected meta-analysis PMIDs");
  assert(
    claimRctCount > 0,
    `expected claim-specific RCT count > 0, got ${claimRctCount}`
  );
  assert(burstZeros === 0, `queued NCBI burst produced ${burstZeros} zeros`);
  assert(
    redlightRctCount > 0,
    `expected red light therapy RCT count > 0, got ${redlightRctCount}`
  );
  assert(
    redlightRctCount < 250,
    `red light + sleep RCT count looks like the whole PBM field: ${redlightRctCount}`
  );
  assert(
    redlightTopic.toLowerCase().includes("sleep"),
    `red light topic query should constrain to sleep: ${redlightTopic}`
  );
  assert(
    brokenHbotRctCount === 0,
    `sanity: consumer-phrase HBOT query should still be 0 RCTs, got ${brokenHbotRctCount}`
  );
  assert(
    hbotRctCount > 0,
    `expected HBOT + immune/energy/collagen RCT count > 0, got ${hbotRctCount} for ${hbotTopic}`
  );
  assert(
    hbotRctCount < 200,
    `HBOT outcome query looks like the whole HBOT field: ${hbotRctCount}`
  );
  assert(
    hbotTopic.toLowerCase().includes("hbot") || hbotTopic.toLowerCase().includes("hyperbaric oxygen"),
    `HBOT query should use literature synonyms: ${hbotTopic}`
  );

  console.log("pubmed live checks passed");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
