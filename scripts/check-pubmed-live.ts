/**
 * Live NCBI checks: topic counts, RCT vs meta-analysis filters, burst load.
 * Run with: npx tsx scripts/check-pubmed-live.ts
 */
import { buildClaimPubMedQuery, buildTopicPubMedQuery } from "../lib/literature-query";
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

  console.log("pubmed live checks passed");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
