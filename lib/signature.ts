import { accountKind, sameAccount } from "./accounts";
import { verifyErc191 } from "./erc191";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { bytesToHex, implicitAccountOf, nonceSaltHex, verifyNep413Crypto } from "./nep413";
import type { SignedIntent, SignedNep413 } from "./types";

export function intentMessage(signed: SignedIntent): string {
  return signed.standard === "nep413" ? signed.payload.message : signed.payload;
}

export function intentNonce(signed: SignedIntent): string {
  if (signed.standard === "nep413") return signed.payload.nonce;
  const parsed = JSON.parse(signed.payload) as { nonce?: string };
  if (!parsed.nonce) throw new Error("Signed payload is missing a nonce");
  return parsed.nonce;
}

export function intentSigner(signed: SignedIntent): string {
  const parsed = JSON.parse(intentMessage(signed)) as { signer_id?: string };
  return parsed.signer_id ?? "";
}

export function verifyUserSignature(signed: SignedIntent, expectedAccount: string): boolean {
  try {
    const signer = intentSigner(signed);
    if (!sameAccount(signer, expectedAccount)) return false;
    if (signed.standard === "erc191") {
      return accountKind(signer) === "evm" && verifyErc191(signed);
    }
    if (signed.standard === "raw_ed25519") {
      const publicKey = bs58.decode(signed.public_key.replace(/^ed25519:/, ""));
      const signature = bs58.decode(signed.signature.replace(/^ed25519:/, ""));
      const ok = ed25519.verify(signature, new TextEncoder().encode(signed.payload), publicKey);
      return ok && bytesToHex(publicKey) === signer.toLowerCase();
    }
    if (signed.standard === "webauthn") {
      // Not verified here, so never accepted. A passkey path needs P-256 verification over the intent hash.
      return false;
    }
    if (!verifyNep413Crypto(signed)) return false;
    if (accountKind(signer) === "implicit") return signer === implicitAccountOf(signed as SignedNep413);
    return accountKind(signer) === "near";
  } catch {
    return false;
  }
}

export function saltOf(signed: SignedIntent): string {
  return nonceSaltHex(intentNonce(signed));
}
