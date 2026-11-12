import assert from "node:assert/strict";
import test from "node:test";
import { parseKrakenMids, referencePrices } from "../lib/quotes";

// Shape copied from a live https://api.kraken.com/0/public/Ticker response (12 Nov 2026).
const KRAKEN = {
  error: [],
  result: {
    XXBTZUSD: { a: ["71742.40000", "1", "1.000"], b: ["71742.30000", "2", "2.000"] },
    XETHZUSD: { a: ["2007.78000", "3", "3.000"], b: ["2007.76000", "1", "1.000"] },
    SOLUSD: { a: ["81.21000", "10", "10.000"], b: ["81.20000", "5", "5.000"] },
    NEARUSD: { a: ["3.38130", "100", "100.000"], b: ["3.38110", "50", "50.000"] },
  },
};

test("Kraken mids are the middle of best bid and ask, and bad rows are skipped", () => {
  const mids = parseKrakenMids(KRAKEN);
  assert.equal(mids["BTC-USDC"], 71742.35);
  assert.equal(mids["ETH-USDC"], 2007.77);
  assert.ok(Math.abs((mids["NEAR-USDC"] ?? 0) - 3.3812) < 1e-9);
  const crossed = parseKrakenMids({ result: { SOLUSD: { a: ["80"], b: ["81"] }, XXBTZUSD: { a: ["x"], b: ["1"] } } });
  assert.equal(crossed["SOL-USDC"], undefined);
  assert.equal(crossed["BTC-USDC"], undefined);
  assert.deepEqual(parseKrakenMids(null), {});
});

test("reference prices: Rhea for NEAR, Kraken for the rest, 1Click when Kraken is down", async () => {
  const original = globalThis.fetch;
  let krakenUp = true;
  let krakenCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("api.kraken.com")) {
      krakenCalls += 1;
      return krakenUp ? json(KRAKEN) : json({ error: ["EService:Unavailable"] }, 503);
    }
    if (url.includes("swapMultiDexPath")) return json({ result_code: 0, result_data: { amount_out: String(33_900_000n) } });
    if (url.endsWith("/v0/tokens")) {
      return json([
        { assetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", price: 1 },
        { assetId: "nep141:btc.omft.near", price: 70000 },
        { assetId: "nep141:eth.omft.near", price: 2000 },
        { assetId: "nep141:sol.omft.near", price: 80 },
        { assetId: "nep141:wrap.near", price: 3.4 },
      ]);
    }
    return json({}, 404);
  }) as typeof fetch;
  try {
    const live = await referencePrices();
    const by = (pair: string) => live.find((row) => row.pair === pair)!;
    assert.equal(by("BTC-USDC").source, "kraken:spot");
    assert.equal(by("BTC-USDC").mid, "71742.35");
    assert.equal(by("NEAR-USDC").source, "rhea:NEAR/USDC pool");
    assert.equal(by("NEAR-USDC").mid, "3.39");

    krakenUp = false;
    // getTokens caches for a few seconds; the fallback reads the cached 1Click prices.
    const fallback = await referencePrices();
    assert.equal(fallback.find((row) => row.pair === "BTC-USDC")!.source, "1click:/v0/tokens");
    const callsAfterFailure = krakenCalls;
    await referencePrices();
    assert.equal(krakenCalls, callsAfterFailure, "Kraken is paused after a failure");
  } finally {
    globalThis.fetch = original;
  }
});
