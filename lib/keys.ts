import bs58 from "bs58";
import { bytesToHex, hexToBytes, keyFromSecret, type DemoKey } from "./nep413";

export type KeySource = "env" | "ephemeral";

/**
 * Parse an ed25519 secret for the operator or market-maker key.
 * Accepts 64 hex characters (32-byte seed) or a NEAR-style `ed25519:<base58>`
 * secret of 64 bytes (seed then public key) or 32 bytes (seed).
 * The account id is the implicit account: the hex public key.
 */
export function parseSecretKey(raw: string): DemoKey {
  const value = raw.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(value)) return keyFromSecret(hexToBytes(value));
  if (value.startsWith("ed25519:")) {
    const bytes = bs58.decode(value.slice("ed25519:".length));
    if (bytes.length === 32) return keyFromSecret(bytes);
    if (bytes.length === 64) {
      const key = keyFromSecret(bytes.slice(0, 32));
      if (bytesToHex(key.publicKey) !== bytesToHex(bytes.slice(32))) {
        throw new Error("ed25519 secret does not match its public key half");
      }
      return key;
    }
    throw new Error("ed25519 secret must decode to 32 or 64 bytes");
  }
  throw new Error("Secret must be 64 hex characters or ed25519:<base58>");
}

/** Reads a key from the environment. A missing or invalid value returns null, and an invalid one is logged. */
export function keyFromEnv(name: string, env: NodeJS.ProcessEnv = process.env): DemoKey | null {
  const raw = env[name];
  if (!raw || !raw.trim()) return null;
  try {
    return parseSecretKey(raw);
  } catch (error) {
    console.error(`${name} is set but invalid: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
