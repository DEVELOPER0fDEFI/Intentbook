import assert from "node:assert/strict";
import test from "node:test";
import { generateKey, signEmptyIntent, signTokenDiff, verifySigned, nonceSaltHex } from "../lib/nep413";

test("NEP-413 signatures round-trip and carry the salt", () => {
  const key = generateKey();
  const salt = "252812b3";
  const signed = signTokenDiff({
    secretKey: key.secretKey,
    deadline: new Date(Date.now() + 60_000).toISOString(),
    diff: {
      "nep141:btc.omft.near": "-10000",
      "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "7434500",
    },
    memo: "intentbook:BTC-USDC:SELL:74345",
    saltHex: salt,
  });
  assert.equal(verifySigned(signed), true);
  assert.equal(nonceSaltHex(signed.payload.nonce), salt);
  assert.equal(JSON.parse(signed.payload.message).signer_id, key.accountId);
  const empty = signEmptyIntent(key.secretKey, salt, new Date(Date.now() + 60_000).toISOString());
  assert.equal(verifySigned(empty), true);
  signed.signature = empty.signature;
  assert.equal(verifySigned(signed), false);
});
