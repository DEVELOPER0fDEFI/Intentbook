import assert from "node:assert/strict";
import test from "node:test";
import { buildCandles, groupDepth, pickWinner } from "../lib/market";
import { retryDelayMs, signWebhook } from "../lib/webhooks";

test("candles bucket trades and depth groups prices", () => {
  const candles = buildCandles(
    [
      { t: 1_000, price: 10, qty: 1 },
      { t: 20_000, price: 12, qty: 1 },
      { t: 40_000, price: 9, qty: 2 },
    ],
    60_000,
  );
  assert.equal(candles.length, 1);
  assert.equal(candles[0]?.o, 10);
  assert.equal(candles[0]?.h, 12);
  assert.equal(candles[0]?.l, 9);
  assert.equal(candles[0]?.c, 9);
  const depth = groupDepth(
    [
      { priceAtoms: 1_500_000n, qtyAtoms: 2n },
      { priceAtoms: 1_200_000n, qtyAtoms: 3n },
    ],
    1_000_000n,
  );
  assert.equal(depth.length, 1);
  assert.equal(depth[0]?.qtyAtoms, "5");
});

test("best venue picks the cheaper buy", () => {
  assert.equal(
    pickWinner("BUY", [
      { venue: "book", quoteAtoms: 90n, ok: true },
      { venue: "1click", quoteAtoms: 100n, ok: true },
    ]),
    "book",
  );
  assert.equal(pickWinner("SELL", [{ venue: "rhea", quoteAtoms: 5n, ok: false }]), null);
});

test("webhook signatures and retry delays are stable", () => {
  const sig = signWebhook("secret", "{\"type\":\"fill\"}");
  assert.equal(sig.length, 64);
  assert.equal(sig, signWebhook("secret", "{\"type\":\"fill\"}"));
  assert.notEqual(sig, signWebhook("other", "{\"type\":\"fill\"}"));
  assert.equal(retryDelayMs(0), 1000);
  assert.equal(retryDelayMs(1), 5000);
  assert.equal(retryDelayMs(9), 600_000);
});
