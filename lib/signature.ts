import { accountKind, sameAccount } from "./accounts";
import { verifyErc191 } from "./erc191";
import { implicitAccountOf, nonceSaltHex, verifyNep413Crypto } from "./nep413";
import type { SignedIntent, SignedNep413 } from "./types";

export function intentMessage(signed: SignedIntent): string {
  return signed.standard === "erc191" ? signed.payload : signed.payload.message;
}

export function intentNonce(signed: SignedIntent): string {
  if (signed.standard === "nep413") return signed.payload.nonce;
  const parsed = JSON.parse(signed.payload) as { nonce?: string };
  if (!parsed.nonce) throw new Error("ERC-191 payload is missing a nonce");
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
