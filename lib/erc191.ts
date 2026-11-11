import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import bs58 from "bs58";
import { bytesToHex } from "./nep413";
import type { SignedErc191 } from "./types";

export function personalSignHash(message: string): Uint8Array {
  const msg = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\u0019Ethereum Signed Message:\n${msg.length}`);
  const joined = new Uint8Array(prefix.length + msg.length);
  joined.set(prefix, 0);
  joined.set(msg, prefix.length);
  return keccak_256(joined);
}

/** Verifier expects v in {0, 1}. MetaMask often returns 27 or 28. */
export function normalizeRecoveryByte(v: number): number {
  if (v === 0 || v === 1) return v;
  if (v === 27 || v === 28) return v - 27;
  if (v >= 35) return (v - 35) % 2;
  throw new Error("recovery byte is out of range");
}

export function erc191Payload(input: {
  signerId: string;
  deadline: string;
  nonce: string;
  intents: unknown[];
}): string {
  return JSON.stringify({
    signer_id: input.signerId,
    verifying_contract: "intents.near",
    deadline: input.deadline,
    nonce: input.nonce,
    intents: input.intents,
  });
}

export function erc191FromNep413Message(message: string, nonce: string): string {
  const parsed = JSON.parse(message) as { signer_id?: string; deadline?: string; intents?: unknown[] };
  return erc191Payload({
    signerId: parsed.signer_id ?? "",
    deadline: parsed.deadline ?? "",
    nonce,
    intents: parsed.intents ?? [],
  });
}

export function addressFromUncompressed(publicKey: Uint8Array): string {
  const raw = publicKey[0] === 4 ? publicKey.slice(1) : publicKey;
  if (raw.length !== 64) throw new Error("secp256k1 public key must be 64 bytes");
  return `0x${bytesToHex(keccak_256(raw).slice(-20))}`;
}

function recoveredToContract(recovered: Uint8Array): Uint8Array {
  if (recovered.length !== 65) throw new Error("recovered signature must be 65 bytes");
  const v = normalizeRecoveryByte(recovered[0] ?? -1);
  const out = new Uint8Array(65);
  out.set(recovered.slice(1), 0);
  out[64] = v;
  return out;
}

export function signErc191(payload: string, secretKey: Uint8Array): SignedErc191 {
  const hash = personalSignHash(payload);
  const recovered = secp256k1.sign(hash, secretKey, { prehash: false, format: "recovered" });
  const signature = recoveredToContract(recovered);
  return { standard: "erc191", payload, signature: `secp256k1:${bs58.encode(signature)}` };
}

export function packEthSignature(payload: string, ethHex: string): SignedErc191 {
  const clean = ethHex.trim().replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{130}$/.test(clean)) throw new Error("MetaMask signature must be 65 bytes");
  const raw = new Uint8Array(65);
  for (let i = 0; i < 65; i++) raw[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  raw[64] = normalizeRecoveryByte(raw[64] ?? -1);
  return { standard: "erc191", payload, signature: `secp256k1:${bs58.encode(raw)}` };
}

export function verifyErc191(signed: SignedErc191): boolean {
  try {
    if (signed.standard !== "erc191" || !signed.signature.startsWith("secp256k1:")) return false;
    const raw = bs58.decode(signed.signature.slice("secp256k1:".length));
    if (raw.length !== 65) return false;
    const v = normalizeRecoveryByte(raw[64] ?? -1);
    const recovered = new Uint8Array(65);
    recovered[0] = v;
    recovered.set(raw.subarray(0, 64), 1);
    const hash = personalSignHash(signed.payload);
    const compressed = secp256k1.recoverPublicKey(recovered, hash, { prehash: false });
    const pub = secp256k1.Point.fromBytes(compressed).toBytes(false);
    const parsed = JSON.parse(signed.payload) as { signer_id?: string };
    return addressFromUncompressed(pub).toLowerCase() === (parsed.signer_id ?? "").toLowerCase();
  } catch {
    return false;
  }
}
