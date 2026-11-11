import assert from "node:assert/strict";
import test from "node:test";
import { closureForDeltas, netSupply } from "../lib/closure";

function expectClosed(deltas: [string, bigint][], fee: bigint) {
  const closure = closureForDeltas(deltas, fee);
  const all: [string, bigint][] = [...deltas, ...closure.entries()];
  const net = netSupply(all, fee);
  for (const [token, value] of net) {
    assert.equal(value, 0n, `${token} supply ${value} at fee ${fee}`);
  }
}

test("balanced swap closes for several fees", () => {
  const trade: [string, bigint][] = [
    ["btc", -100_000n],
    ["usdc", 90_000_000n],
    ["btc", 100_000n],
    ["usdc", -90_000_000n],
  ];
  for (const fee of [0n, 1n, 100n, 500n]) expectClosed(trade, fee);
});

test("several maker lots close with the taker opposite", () => {
  const makers: [string, bigint][] = [
    ["btc", -10_000n],
    ["usdc", 7_400_000n],
    ["btc", -20_000n],
    ["usdc", 14_900_000n],
  ];
  const sum = new Map<string, bigint>();
  for (const [token, amount] of makers) sum.set(token, (sum.get(token) ?? 0n) + amount);
  const taker: [string, bigint][] = [...sum.entries()].map(([token, amount]) => [token, -amount]);
  expectClosed([...makers, ...taker], 1n);
  const closure = closureForDeltas([...makers, ...taker], 1n);
  assert.ok([...closure.values()].some((amount) => amount < 0n));
});

test("zero fee on a balanced swap needs no closure", () => {
  const closure = closureForDeltas(
    [
      ["btc", -5n],
      ["usdc", 10n],
      ["btc", 5n],
      ["usdc", -10n],
    ],
    0n,
  );
  assert.equal(closure.size, 0);
});
