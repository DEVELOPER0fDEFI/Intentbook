import { PAIRS, USDC_ASSET } from "../lib/assets";
import { closureForDeltas, netSupply } from "../lib/closure";
import { formatAtoms, formatUsd, quoteAtomsForBase } from "../lib/format";
import { generateKey, readDiffs, signEmptyIntent, signTokenDiff, verifySigned } from "../lib/nep413";
import { depositQuote, referencePrices } from "../lib/quotes";
import { interpretSimulation, protocolState, simulateIntents } from "../lib/verifier";

function fail(message: string): never {
  console.error(`demo:dry failed: ${message}`);
  process.exit(1);
}

async function main() {
const protocol = await protocolState();
console.log(`protocol fee ${protocol.feePips} pip(s), salt ${protocol.salt}, collector ${protocol.feeCollector}`);

const prices = await referencePrices();
const btc = prices.find((price) => price.pair === "BTC-USDC");
if (!btc) fail("no BTC reference price from 1Click /v0/tokens");
console.log(`BTC mid ${btc.mid} USDC via ${btc.source}`);
const near = prices.find((price) => price.pair === "NEAR-USDC");
if (near?.rheaMid) console.log(`NEAR token mid ${near.mid}, Rhea mid ${near.rheaMid}`);

const spec = PAIRS["BTC-USDC"];
const qty = 10_000n;
const quoteAtoms = quoteAtomsForBase(qty, btc.midAtoms, spec.baseDecimals);
const maker = generateKey();
const taker = generateKey();
const operator = generateKey();
const deadline = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const makerSigned = signTokenDiff({
  secretKey: maker.secretKey,
  deadline,
  diff: { [spec.baseAsset]: (-qty).toString(), [USDC_ASSET]: quoteAtoms.toString() },
  memo: `intentbook:BTC-USDC:SELL:${btc.mid}`,
  saltHex: protocol.salt,
});
const takerSigned = signTokenDiff({
  secretKey: taker.secretKey,
  deadline,
  diff: { [spec.baseAsset]: qty.toString(), [USDC_ASSET]: (-quoteAtoms).toString() },
  memo: "intentbook:BTC-USDC:BUY:TAKE",
  saltHex: protocol.salt,
});
if (!verifySigned(makerSigned) || !verifySigned(takerSigned)) fail("local signature verify failed");

const deltas = [makerSigned, takerSigned].flatMap((signed) => {
  const diff = readDiffs(signed.payload.message)[0]?.diff ?? {};
  return Object.entries(diff) as [string, bigint][];
});
const closure = closureForDeltas(deltas, BigInt(protocol.feePips));
const closureDiff = Object.fromEntries([...closure.entries()].map(([token, amount]) => [token, amount.toString()]));
const closed = netSupply([...deltas, ...closure.entries()], BigInt(protocol.feePips));
for (const [token, value] of closed) {
  if (value !== 0n) fail(`closure left ${token} supply ${value}`);
}
const closureSigned = signTokenDiff({
  secretKey: operator.secretKey,
  deadline,
  diff: closureDiff,
  memo: "intentbook:BTC-USDC:CLOSURE",
  saltHex: protocol.salt,
});

const batch = await simulateIntents([makerSigned, takerSigned, closureSigned]);
const batchVerdict = interpretSimulation(batch);
console.log(`matched batch simulate: ${batchVerdict.kind}`);
console.log(JSON.stringify(batch, null, 2).slice(0, 1200));
if (batchVerdict.kind === "rejected") fail(batchVerdict.message);

const probe = signEmptyIntent(maker.secretKey, protocol.salt, deadline);
const probeResult = await simulateIntents([probe]);
const probeVerdict = interpretSimulation(probeResult);
console.log(`empty-intent simulate: ${probeVerdict.kind}`);
if (probeVerdict.kind !== "executed") fail("empty intent simulation did not succeed");
console.log(JSON.stringify(probeResult, null, 2).slice(0, 900));

const quote = await depositQuote({
  usdcAmount: "20",
  intentsAccount: taker.accountId,
  refundTo: "0x0000000000000000000000000000000000000001",
});
const amountOut =
  quote && typeof quote === "object" && "quote" in quote
    ? (quote as { quote?: { amountOut?: string; amountOutFormatted?: string } }).quote
    : null;
if (!amountOut?.amountOut) fail("dry quote did not return amountOut");
console.log(
  `dry quote: 20 Base USDC -> ${amountOut.amountOutFormatted ?? amountOut.amountOut} canonical USDC on Intents (not executed)`,
);
console.log(
  `signed a ${formatAtoms(qty, spec.baseDecimals, 8)} BTC lot at about ${formatUsd(btc.midAtoms)} USDC. No execute_intents call.`,
);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
