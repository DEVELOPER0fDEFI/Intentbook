import assert from "node:assert/strict";
import test from "node:test";
import bs58 from "bs58";
import { lotFor } from "../lib/assets";
import { keyFromEnv, parseSecretKey } from "../lib/keys";
import { bytesToHex, generateKey } from "../lib/nep413";

test("secret keys parse from hex and NEAR ed25519 formats", () => {
  const key = generateKey();
  const hex = bytesToHex(key.secretKey);
  assert.equal(parseSecretKey(hex).accountId, key.accountId);
  assert.equal(parseSecretKey(`0x${hex}`).accountId, key.accountId);
  const full = new Uint8Array(64);
  full.set(key.secretKey, 0);
  full.set(key.publicKey, 32);
  assert.equal(parseSecretKey(`ed25519:${bs58.encode(full)}`).accountId, key.accountId);
  assert.equal(parseSecretKey(`ed25519:${bs58.encode(key.secretKey)}`).accountId, key.accountId);
  const mismatched = new Uint8Array(full);
  mismatched[63] ^= 1;
  assert.throws(() => parseSecretKey(`ed25519:${bs58.encode(mismatched)}`));
  assert.throws(() => parseSecretKey("not a key"));
});

test("keyFromEnv returns null for missing or invalid values", () => {
  const original = console.error;
  console.error = () => undefined;
  try {
    assert.equal(keyFromEnv("X", {} as unknown as NodeJS.ProcessEnv), null);
    assert.equal(keyFromEnv("X", { X: "garbage" } as unknown as NodeJS.ProcessEnv), null);
  } finally {
    console.error = original;
  }
  const key = generateKey();
  assert.equal(keyFromEnv("X", { X: bytesToHex(key.secretKey) } as unknown as NodeJS.ProcessEnv)?.accountId, key.accountId);
});

test("lot size can be overridden per base asset", () => {
  assert.equal(lotFor("NEAR-USDC", {} as unknown as NodeJS.ProcessEnv), "2");
  assert.equal(lotFor("NEAR-USDC", { INTENTBOOK_LOT_NEAR: "0.1" } as unknown as NodeJS.ProcessEnv), "0.1");
  assert.equal(lotFor("NEAR-USDC", { INTENTBOOK_LOT_NEAR: "-1" } as unknown as NodeJS.ProcessEnv), "2");
  assert.equal(lotFor("BTC-USDC", { INTENTBOOK_LOT_BTC: "0.000000001" } as unknown as NodeJS.ProcessEnv), "0.0001");
});
