import assert from "node:assert/strict";
import test from "node:test";
import { closureForDeltas, netSupply } from "../lib/closure";
import { TAKER_FEE_BPS, takerFeeAtoms, takerLeg } from "../lib/fees";

test("taker fee is 8 bps rounded up and maker fee is zero", () => {
  assert.equal(TAKER_FEE_BPS, 8n);
  assert.equal(takerFeeAtoms(10_000_000n), 8_000n);
  assert.equal(takerFeeAtoms(1n), 1n);
  assert.equal(takerFeeAtoms(0n), 0n);
});

test("buy fee is paid on top and the batch still closes", () => {
  const makers = [{ btc: -100_000n, usdc: 10_000_000n }];
  const leg = takerLeg(makers, "usdc");
  assert.equal(leg.fee, 8_000n);
  assert.equal(leg.taker.usdc, "-10008000");
  assert.equal(leg.taker.btc, "100000");
  assert.equal(leg.operator.usdc, "8000");
  const deltas: [string, bigint][] = [
    ["btc", -100_000n],
    ["usdc", 10_000_000n],
    ["btc", 100_000n],
    ["usdc", -10_008_000n],
    ["usdc", 8_000n],
  ];
  const closure = closureForDeltas(deltas, 1n);
  const net = netSupply([...deltas, ...closure.entries()], 1n);
  for (const [, value] of net) assert.equal(value, 0n);
});

test("sell fee comes out of proceeds", () => {
  const makers = [{ btc: 100_000n, usdc: -10_000_000n }];
  const leg = takerLeg(makers, "usdc");
  assert.equal(leg.taker.btc, "-100000");
  assert.equal(leg.taker.usdc, "9992000");
  assert.equal(leg.operator.usdc, "8000");
});
