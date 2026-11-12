import { INTENTS_CONTRACT } from "./assets";
import type { SignedIntent } from "./types";

/** Every NEAR RPC failed. Surfaced to clients as a 503 they can retry. */
export class RpcUnavailableError extends Error {
  status = 503;
  constructor(detail: string) {
    super(`NEAR RPC did not answer (${detail}). Try again in a moment.`);
  }
}

function rpcUrls(): string[] {
  const urls = [process.env.NEAR_RPC_URL, "https://rpc.fastnear.com", "https://rpc.mainnet.near.org"].filter(
    (value): value is string => Boolean(value),
  );
  return [...new Set(urls)];
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as { panic_msg?: string; message?: string; data?: unknown };
    if (typeof record.panic_msg === "string") return record.panic_msg;
    if (typeof record.message === "string") return record.message;
    try {
      return JSON.stringify(error);
    } catch {
      return "rpc error";
    }
  }
  return String(error);
}

export async function viewCall(method: string, args: unknown = {}): Promise<unknown> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "query",
    params: {
      request_type: "call_function",
      finality: "final",
      account_id: process.env.INTENTS_CONTRACT || INTENTS_CONTRACT,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args ?? {})).toString("base64"),
    },
  });
  let last = "NEAR RPC failed";
  // Two rounds over the RPC list: public RPCs drop the odd request, and one retry usually lands.
  for (const rpc of [...rpcUrls(), ...rpcUrls()]) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(12000),
      });
      const json = (await res.json()) as {
        error?: unknown;
        result?: { result?: number[]; error?: unknown };
      };
      if (json.result?.error) return { error: errorText(json.result.error) };
      if (json.error || !json.result?.result) {
        last = errorText(json.error ?? `empty result from ${rpc}`);
        continue;
      }
      return JSON.parse(Buffer.from(json.result.result).toString());
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new RpcUnavailableError(last);
}

export async function protocolState(): Promise<{ feePips: number; salt: string; feeCollector: string }> {
  const [fee, salt, feeCollector] = await Promise.all([
    viewCall("fee", {}),
    viewCall("current_salt", {}),
    viewCall("fee_collector", {}),
  ]);
  if (typeof fee !== "number" || typeof salt !== "string" || typeof feeCollector !== "string") {
    const failed = [fee, salt, feeCollector].find((item) => item && typeof item === "object" && "error" in item);
    throw new Error(failed ? errorText((failed as { error: unknown }).error) : "unexpected protocol state");
  }
  return { feePips: fee, salt, feeCollector };
}

export async function simulateIntents(signed: SignedIntent[]): Promise<unknown> {
  return viewCall("simulate_intents", { signed });
}

export async function batchBalances(accountId: string, tokenIds: string[]): Promise<string[] | null> {
  if (tokenIds.length === 0) return [];
  const value = await viewCall("mt_batch_balance_of", { account_id: accountId, token_ids: tokenIds });
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  return null;
}

export async function hasPublicKey(accountId: string, publicKey: string): Promise<boolean | null> {
  try {
    const value = await viewCall("has_public_key", { account_id: accountId, public_key: publicKey });
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Whether `publicKey` is a full-access key of the NEAR account `accountId`.
 * Returns null when every RPC failed, so callers can refuse instead of guessing.
 */
export async function fullAccessKey(accountId: string, publicKey: string): Promise<boolean | null> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "query",
    params: { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey },
  });
  for (const rpc of rpcUrls()) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json()) as {
        error?: { cause?: { name?: string } };
        result?: { error?: string; permission?: unknown };
      };
      if (json.result?.error) return false;
      if (json.error?.cause?.name === "UNKNOWN_ACCOUNT" || json.error?.cause?.name === "UNKNOWN_ACCESS_KEY") return false;
      if (json.result && "permission" in json.result) return json.result.permission === "FullAccess";
    } catch {
      // Try the next RPC.
    }
  }
  return null;
}

export async function nonceUsed(accountId: string, nonce: string): Promise<boolean | null> {
  const value = await viewCall("is_nonce_used", { account_id: accountId, nonce });
  return typeof value === "boolean" ? value : null;
}

export type SimVerdict =
  | { kind: "executed"; intentHashes: string[]; message: string }
  | { kind: "unfunded"; message: string }
  | { kind: "rejected"; message: string };

export function interpretSimulation(raw: unknown): SimVerdict {
  if (raw && typeof raw === "object" && "intents_executed" in raw) {
    const executed = (raw as { intents_executed?: { intent_hash?: string }[] }).intents_executed ?? [];
    return {
      kind: "executed",
      intentHashes: executed.map((item) => item.intent_hash ?? "").filter(Boolean),
      message: "simulate_intents succeeded",
    };
  }
  const message =
    raw && typeof raw === "object" && "error" in raw
      ? errorText((raw as { error: unknown }).error)
      : "empty simulation response";
  if (/insufficient balance/i.test(message)) return { kind: "unfunded", message };
  return { kind: "rejected", message };
}
