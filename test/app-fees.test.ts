import assert from "node:assert/strict";
import test from "node:test";
import { configuredAppFees, oneclickFeeSchedule } from "../lib/app-fees";
import { priceEdge, walkBook } from "../lib/compare";

test("1Click fees follow the published split", () => {
  const pub = oneclickFeeSchedule({ appFeeBps: 0, hasJwt: false });
  assert.equal(pub.protocolBps, 25);
  assert.equal(pub.oneclickKeepsBps, 25);
  const partner = oneclickFeeSchedule({ appFeeBps: 10, hasJwt: true });
  assert.equal(partner.protocolBps, 20);
  assert.equal(partner.recipientBps, 5);
  assert.equal(partner.oneclickKeepsBps, 25);
  assert.equal(partner.userPaysBps, 30);
  assert.match(partner.rules, /50\/50/);
  assert.match(partner.rules, /at least 20 bps/);
});

test("app fee config is empty until recipient and bps are set", () => {
  assert.deepEqual(configuredAppFees({} as NodeJS.ProcessEnv), []);
  assert.deepEqual(configuredAppFees({ ONECLICK_APP_FEE_BPS: "15", ONECLICK_APP_FEE_RECIPIENT: "fees.near" } as unknown as NodeJS.ProcessEnv), [
    { recipient: "fees.near", fee: 15 },
  ]);
});

test("book walk adds the taker fee and reports savings against 1Click", () => {
  const walk = walkBook({
    side: "BUY",
    qty: 2n,
    levels: [{ priceAtoms: 100n, qtyAtoms: 2n }],
    baseDecimals: 0,
    takerFeeBps: 8n,
  });
  assert.equal(walk.quote, 200n);
  assert.equal(walk.fee, 1n);
  assert.equal(walk.total, 201n);
  const edge = priceEdge({ side: "BUY", bookQuote: 201n, otherQuote: 250n });
  assert.equal(edge.bookBetter, true);
  assert.equal(edge.delta, 49n);
  assert.equal(edge.bps, 1960n);
});
