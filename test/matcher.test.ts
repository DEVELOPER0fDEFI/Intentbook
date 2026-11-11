import assert from "node:assert/strict";
import test from "node:test";
import { selectLots, type MatchLot } from "../lib/matcher";
import { parsePlain } from "../lib/parse";
import { normalizeNumber, parseAtoms, quoteAtomsForBase } from "../lib/format";

function lot(id: string, side: "BUY" | "SELL", price: bigint, qty: bigint, createdAt: number): MatchLot {
  return { id, side, price, qty, createdAt, deadline: 10_000 };
}

test("price-time priority takes the better price, then the earlier lot", () => {
  const lots = [
    lot("late-cheap", "SELL", 100n, 2n, 20),
    lot("early-rich", "SELL", 110n, 2n, 5),
    lot("early-cheap", "SELL", 100n, 2n, 1),
  ];
  const { taken, leftover } = selectLots(lots, { side: "BUY", limit: 110n, qty: 4n, now: 1 });
  assert.deepEqual(taken.map((item) => item.id), ["early-cheap", "late-cheap"]);
  assert.equal(leftover, 0n);
});

test("whole lots only, and a limit does not cross through", () => {
  const lots = [lot("big", "SELL", 100n, 5n, 1), lot("small", "SELL", 101n, 2n, 2)];
  const partial = selectLots(lots, { side: "BUY", limit: 101n, qty: 3n, now: 1 });
  assert.deepEqual(partial.taken.map((item) => item.id), []);
  assert.equal(partial.leftover, 3n);
  const fit = selectLots(lots, { side: "BUY", limit: 101n, qty: 7n, now: 1 });
  assert.deepEqual(fit.taken.map((item) => item.id), ["big", "small"]);
  const below = selectLots(lots, { side: "BUY", limit: 99n, qty: 5n, now: 1 });
  assert.equal(below.taken.length, 0);
});

test("sells hit the highest bid and skip reserved or expired lots", () => {
  const lots = [
    lot("bid-low", "BUY", 90n, 2n, 1),
    lot("bid-high", "BUY", 95n, 2n, 2),
    { ...lot("held", "BUY", 99n, 2n, 1), reservedUntil: 50 },
    { ...lot("old", "BUY", 120n, 2n, 1), deadline: 5 },
  ];
  const { taken } = selectLots(lots, { side: "SELL", limit: null, qty: 2n, now: 10 });
  assert.equal(taken[0]?.id, "bid-high");
});

test("plain language and decimal amounts", () => {
  assert.deepEqual(parsePlain("buy 0.0002 BTC at $90k"), {
    side: "BUY",
    pair: "BTC-USDC",
    qty: "0.0002",
    orderType: "LIMIT",
    price: "90k",
  });
  assert.equal(parsePlain("sell 2 NEAR at market")?.orderType, "MARKET");
  assert.equal(parsePlain("hello"), null);
  assert.equal(normalizeNumber("$90,000"), "90000");
  assert.equal(normalizeNumber("1.5k"), "1500");
  assert.equal(parseAtoms("0.0001", 8), 10_000n);
  assert.equal(quoteAtomsForBase(10_000n, 74_345_000_000n, 8), 7_434_500n);
});
