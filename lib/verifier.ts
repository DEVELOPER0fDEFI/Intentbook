import { INTENTS_CONTRACT } from "./assets";
import type { SignedNep413 } from "./types";

function rpcUrls(): string[] {
  const urls = [process.env.NEAR_RPC_URL, "https://rpc.mainnet.near.org", "https://rpc.fastnear.com"].filter(
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
  for (const rpc of rpcUrls()) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(20000),
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
  throw new Error(last);
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

export async function simulateIntents(signed: SignedNep413[]): Promise<unknown> {
  return viewCall("simulate_intents", { signed });
}

export async function batchBalances(accountId: string, tokenIds: string[]): Promise<string[] | null> {
  if (tokenIds.length === 0) return [];
  const value = await viewCall("mt_batch_balance_of", { account_id: accountId, token_ids: tokenIds });
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
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
