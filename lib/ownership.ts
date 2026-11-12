import { accountKind } from "./accounts";
import { intentSigner, verifyUserSignature } from "./signature";
import type { SignedIntent } from "./types";
import { fullAccessKey, hasPublicKey } from "./verifier";

export class OwnershipError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const CACHE_MS = 5 * 60 * 1000;
const owned = new Map<string, number>();

/** Test hook. */
export function clearOwnershipCache() {
  owned.clear();
}

/**
 * A NEP-413 signature proves control of a key, not of a named account.
 * For a named account the key must be a full-access key of that account on NEAR,
 * or a key the account registered on intents.near with add_public_key.
 */
export async function keyOwnsAccount(accountId: string, publicKey: string): Promise<boolean | null> {
  const cacheKey = `${accountId}|${publicKey}`;
  const until = owned.get(cacheKey);
  if (until && until > Date.now()) return true;
  const [full, registered] = await Promise.all([
    fullAccessKey(accountId, publicKey).catch(() => null),
    hasPublicKey(accountId, publicKey).catch(() => null),
  ]);
  if (full === true || registered === true) {
    owned.set(cacheKey, Date.now() + CACHE_MS);
    return true;
  }
  if (full === null && registered === null) return null;
  return false;
}

/** Verifies the signature and, for named NEAR accounts, that the signing key belongs to the account. */
export async function verifySigner(signed: SignedIntent, expectedAccount: string): Promise<void> {
  if (!verifyUserSignature(signed, expectedAccount)) throw new OwnershipError(400, "Signature did not verify");
  if (signed.standard !== "nep413") return;
  const signer = intentSigner(signed);
  if (accountKind(signer) !== "near") return;
  const ok = await keyOwnsAccount(signer, signed.public_key);
  if (ok === null) throw new OwnershipError(503, "Could not confirm the signing key on NEAR. Try again.");
  if (!ok) {
    throw new OwnershipError(
      403,
      `The signing key is not a full-access key of ${signer} and is not registered on intents.near`,
    );
  }
}
