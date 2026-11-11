import assert from "node:assert/strict";
import test from "node:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import bs58 from "bs58";
import { addressFromUncompressed, erc191Payload, normalizeRecoveryByte, packEthSignature, signErc191, verifyErc191 } from "../lib/erc191";

test("recovery byte normalization accepts wallet and contract forms", () => {
  assert.equal(normalizeRecoveryByte(0), 0);
  assert.equal(normalizeRecoveryByte(27), 0);
  assert.equal(normalizeRecoveryByte(28), 1);
  assert.equal(normalizeRecoveryByte(37), 0);
});

test("ERC-191 personal_sign round-trips to the signer address", () => {
  const secret = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(secret, false);
  const address = addressFromUncompressed(pub);
  const payload = erc191Payload({
    signerId: address,
    deadline: "2026-11-14T23:59:00.000Z",
    nonce: "Vij2xgAlKBKzwGNqwogWQxiy87p9jW5Omfg+L9bXBDw=",
    intents: [{ intent: "token_diff", diff: { "nep141:usdc.near": "-1000" } }],
  });
  const signed = signErc191(payload, secret);
  assert.equal(verifyErc191(signed), true);
  const bytes = bs58.decode(signed.signature.slice("secp256k1:".length));
  const shifted = `0x${[...bytes.slice(0, 64)].map((b) => b.toString(16).padStart(2, "0")).join("")}${(bytes[64]! + 27).toString(16).padStart(2, "0")}`;
  assert.equal(verifyErc191(packEthSignature(payload, shifted)), true);
  signed.payload = signed.payload.replace(address, "0x0000000000000000000000000000000000000001");
  assert.equal(verifyErc191(signed), false);
});
