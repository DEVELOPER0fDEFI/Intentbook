import assert from "node:assert/strict";
import test from "node:test";
import { bytesToBase64, bytesToHex, makeLegacyNonce, makeVersionedNonce, nonceSaltHex, VERSIONED_NONCE_MAGIC } from "../lib/nep413";

test("versioned nonce keeps the salt and the deadline", () => {
  const salt = "252812b3";
  const deadline = Date.UTC(2026, 10, 14, 23, 59, 0);
  const nonce = makeVersionedNonce(salt, deadline);
  assert.equal(nonce.length, 32);
  assert.equal(bytesToHex(nonce.slice(0, 4)), VERSIONED_NONCE_MAGIC);
  assert.equal(nonce[4], 1);
  assert.equal(bytesToHex(nonce.slice(5, 9)), salt);
  assert.equal(nonceSaltHex(bytesToBase64(nonce)), salt);
  const stored = new DataView(nonce.buffer).getBigUint64(9, true);
  assert.equal(stored, BigInt(deadline) * 1_000_000n);
  const legacy = makeLegacyNonce(salt);
  assert.equal(nonceSaltHex(bytesToBase64(legacy)), salt);
  assert.notEqual(bytesToHex(legacy.slice(0, 4)), VERSIONED_NONCE_MAGIC);
});
