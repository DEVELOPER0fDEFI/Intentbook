import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { REFERRAL } from "./assets";
import type { SignedNep413 } from "./types";

const NEP413_TAG = 2147484061;

export interface DemoKey {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
  accountId: string;
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, "");
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

export function nep413Hash(message: string, nonce: Uint8Array, recipient: string): Uint8Array {
  if (nonce.length !== 32) throw new Error("nonce must be 32 bytes");
  const msg = new TextEncoder().encode(message);
  const rec = new TextEncoder().encode(recipient);
  return sha256(
    concat([u32le(NEP413_TAG), u32le(msg.length), msg, nonce, u32le(rec.length), rec, new Uint8Array([0])]),
  );
}

export function generateKey(): DemoKey {
  const secretKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  return { secretKey, publicKey, accountId: bytesToHex(publicKey) };
}

export function keyFromSecret(secretKey: Uint8Array): DemoKey {
  if (secretKey.length !== 32) throw new Error("ed25519 secret key must be 32 bytes");
  const publicKey = ed25519.getPublicKey(secretKey);
  return { secretKey, publicKey, accountId: bytesToHex(publicKey) };
}

export const VERSIONED_NONCE_MAGIC = "5628f6c6";

let forceLegacyNonces = false;

export function useLegacyNonces() {
  forceLegacyNonces = true;
}

export function legacyNoncesEnabled(): boolean {
  return forceLegacyNonces || process.env.INTENTBOOK_NONCE === "legacy";
}

export function makeLegacyNonce(saltHex: string): Uint8Array {
  const salt = hexToBytes(saltHex);
  if (salt.length !== 4) throw new Error("salt must be 4 bytes");
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  nonce.set(salt, 0);
  return nonce;
}

/** 32 bytes: magic 5628f6c6, version 1, 4-byte salt, 8-byte deadline ns, 15 random bytes. */
export function makeVersionedNonce(saltHex: string, deadlineMs: number): Uint8Array {
  const salt = hexToBytes(saltHex);
  if (salt.length !== 4) throw new Error("salt must be 4 bytes");
  const nonce = new Uint8Array(32);
  nonce.set(hexToBytes(VERSIONED_NONCE_MAGIC), 0);
  nonce[4] = 1;
  nonce.set(salt, 5);
  const deadlineNs = BigInt(Math.max(0, Math.floor(deadlineMs))) * 1_000_000n;
  new DataView(nonce.buffer).setBigUint64(9, deadlineNs, true);
  crypto.getRandomValues(nonce.subarray(17));
  return nonce;
}

export function makeNonce(saltHex: string, deadlineMs?: number): Uint8Array {
  if (deadlineMs == null || legacyNoncesEnabled()) return makeLegacyNonce(saltHex);
  return makeVersionedNonce(saltHex, deadlineMs);
}

export function sortedDiff(diff: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(diff).sort()) {
    const value = diff[key];
    if (!value || value === "0" || value === "-0") continue;
    if (!/^-?\d+$/.test(value)) throw new Error(`bad diff amount for ${key}`);
    out[key] = value;
  }
  return out;
}

export function tokenDiffMessage(input: {
  signerId: string;
  deadline: string;
  diff: Record<string, string>;
  memo: string;
}): string {
  return JSON.stringify({
    signer_id: input.signerId,
    deadline: input.deadline,
    intents: [
      {
        intent: "token_diff",
        diff: sortedDiff(input.diff),
        memo: input.memo,
        referral: REFERRAL,
      },
    ],
  });
}

export function emptyIntentMessage(signerId: string, deadline: string): string {
  return JSON.stringify({
    signer_id: signerId,
    deadline,
    intents: [],
  });
}

export function signExisting(input: {
  secretKey: Uint8Array;
  message: string;
  nonceBase64: string;
}): SignedNep413 {
  const key = keyFromSecret(input.secretKey);
  const nonce = base64ToBytes(input.nonceBase64);
  const hash = nep413Hash(input.message, nonce, "intents.near");
  const signature = ed25519.sign(hash, key.secretKey);
  return {
    standard: "nep413",
    payload: {
      recipient: "intents.near",
      nonce: input.nonceBase64,
      message: input.message,
    },
    public_key: `ed25519:${bs58.encode(key.publicKey)}`,
    signature: `ed25519:${bs58.encode(signature)}`,
  };
}

export function signTokenDiff(input: {
  secretKey: Uint8Array;
  deadline: string;
  diff: Record<string, string>;
  memo: string;
  saltHex: string;
}): SignedNep413 {
  const key = keyFromSecret(input.secretKey);
  const message = tokenDiffMessage({
    signerId: key.accountId,
    deadline: input.deadline,
    diff: input.diff,
    memo: input.memo,
  });
  const nonce = makeNonce(input.saltHex, Date.parse(input.deadline));
  return signExisting({ secretKey: input.secretKey, message, nonceBase64: bytesToBase64(nonce) });
}

export function signEmptyIntent(secretKey: Uint8Array, saltHex: string, deadline: string): SignedNep413 {
  const key = keyFromSecret(secretKey);
  const message = emptyIntentMessage(key.accountId, deadline);
  const nonce = makeNonce(saltHex, Date.parse(deadline));
  return signExisting({ secretKey, message, nonceBase64: bytesToBase64(nonce) });
}

export function verifyNep413Crypto(signed: SignedNep413): boolean {
  try {
    if (signed.standard !== "nep413") return false;
    if (signed.payload.recipient !== "intents.near") return false;
    if (!signed.public_key.startsWith("ed25519:") || !signed.signature.startsWith("ed25519:")) return false;
    const publicKey = bs58.decode(signed.public_key.slice("ed25519:".length));
    const signature = bs58.decode(signed.signature.slice("ed25519:".length));
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    const nonce = base64ToBytes(signed.payload.nonce);
    if (nonce.length !== 32) return false;
    const hash = nep413Hash(signed.payload.message, nonce, signed.payload.recipient);
    return ed25519.verify(signature, hash, publicKey);
  } catch {
    return false;
  }
}

export function implicitAccountOf(signed: SignedNep413): string | null {
  try {
    const publicKey = bs58.decode(signed.public_key.slice("ed25519:".length));
    return bytesToHex(publicKey);
  } catch {
    return null;
  }
}

export function verifySigned(signed: SignedNep413): boolean {
  if (!verifyNep413Crypto(signed)) return false;
  try {
    const parsed = JSON.parse(signed.payload.message) as { signer_id?: string };
    return parsed.signer_id === implicitAccountOf(signed);
  } catch {
    return false;
  }
}

export function readDiffs(message: string): { signerId: string; diff: Record<string, bigint> }[] {
  const parsed = JSON.parse(message) as {
    signer_id?: string;
    intents?: { intent?: string; diff?: Record<string, string> }[];
  };
  const signerId = parsed.signer_id ?? "";
  const out: { signerId: string; diff: Record<string, bigint> }[] = [];
  for (const intent of parsed.intents ?? []) {
    if (intent.intent !== "token_diff" || !intent.diff) continue;
    const diff: Record<string, bigint> = {};
    for (const [token, amount] of Object.entries(intent.diff)) diff[token] = BigInt(amount);
    out.push({ signerId, diff });
  }
  return out;
}

export function nonceSaltHex(nonceBase64: string): string {
  const bytes = base64ToBytes(nonceBase64);
  if (bytes.length >= 9 && bytesToHex(bytes.slice(0, 4)) === VERSIONED_NONCE_MAGIC) {
    return bytesToHex(bytes.slice(5, 9));
  }
  return bytesToHex(bytes.slice(0, 4));
}

export function nonceRejected(message: string): boolean {
  return /nonce|salt/i.test(message);
}
