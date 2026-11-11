/** Live settlement policy. Default is dry-run. This module never broadcasts. */

export const LIVE_MAX_LOTS = 5n;
/** 50 USDC, 6 decimals. */
export const LIVE_MAX_QUOTE_ATOMS = 50n * 1_000_000n;

export function liveRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.INTENTBOOK_LIVE === "1";
}

export function relayerConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.NEAR_RELAYER_ACCOUNT && env.NEAR_RELAYER_PRIVATE_KEY);
}

export interface ExecutionInput {
  live: boolean;
  verdict: "executed" | "unfunded" | "rejected";
  baseQty: bigint;
  lot: bigint;
  quoteQty: bigint;
  relayerConfigured: boolean;
}

export function executionDecision(input: ExecutionInput): { broadcast: boolean; reason: string } {
  if (!input.live) {
    return { broadcast: false, reason: "Dry-run. execute_intents was not called." };
  }
  if (!input.relayerConfigured) {
    return {
      broadcast: false,
      reason: "INTENTBOOK_LIVE=1 but the relayer account is not configured. Refusing to broadcast.",
    };
  }
  if (input.verdict !== "executed") {
    return { broadcast: false, reason: "Simulation did not succeed. Refusing to broadcast." };
  }
  if (input.lot <= 0n || input.baseQty > input.lot * LIVE_MAX_LOTS) {
    return { broadcast: false, reason: "Order is above the live size cap. Refusing to broadcast." };
  }
  if (input.quoteQty > LIVE_MAX_QUOTE_ATOMS) {
    return { broadcast: false, reason: "Quote is above the 50 USDC live cap. Refusing to broadcast." };
  }
  return { broadcast: true, reason: "Simulation succeeded inside the size cap." };
}
