import { activeFeeSchedule, configuredAppFees } from "./app-fees";
import {
  BASE_USDC_ASSET,
  ONECLICK_BASE,
  PAIRS,
  RHEA_QUOTE_URL,
  USDC_ASSET,
  USDC_CONTRACT,
  USDC_DECIMALS,
} from "./assets";
import { formatAtoms, formatPrice, parseAtoms } from "./format";
import type { PairId, Side } from "./types";

export interface TokenRow {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
  priceUpdatedAt?: string;
}

let tokenCache: { at: number; rows: TokenRow[] } | null = null;

function oneclickBase(): string {
  return (process.env.ONECLICK_BASE || ONECLICK_BASE).replace(/\/$/, "");
}

function oneclickHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const jwt = process.env.ONECLICK_JWT;
  if (jwt) {
    headers.authorization = `Bearer ${jwt}`;
    headers["x-api-key"] = jwt;
  }
  return headers;
}

export async function getTokens(force = false): Promise<TokenRow[]> {
  if (!force && tokenCache && Date.now() - tokenCache.at < 8_000) return tokenCache.rows;
  const res = await fetch(`${oneclickBase()}/v0/tokens`, { headers: oneclickHeaders(), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`1Click tokens failed (${res.status})`);
  const rows = (await res.json()) as TokenRow[];
  if (!Array.isArray(rows)) throw new Error("1Click tokens response was not a list");
  tokenCache = { at: Date.now(), rows };
  return rows;
}

export interface ReferencePrice {
  pair: PairId;
  midAtoms: bigint;
  mid: string;
  source: string;
  updatedAt?: string;
  rheaMid?: string;
}

export async function rheaNearPrice(): Promise<{ atoms: bigint; human: string } | null> {
  const amountIn = 10n * 10n ** 24n;
  const url = new URL(RHEA_QUOTE_URL);
  url.searchParams.set("amountIn", amountIn.toString());
  url.searchParams.set("tokenIn", "wrap.near");
  url.searchParams.set("tokenOut", USDC_CONTRACT);
  url.searchParams.set("slippage", "0.005");
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    result_code?: number;
    result_data?: { amount_out?: string };
  };
  if (json.result_code !== 0 || !json.result_data?.amount_out) return null;
  const out = BigInt(json.result_data.amount_out);
  const perNear = out / 10n;
  if (perNear <= 0n) return null;
  return { atoms: perNear, human: formatAtoms(perNear, USDC_DECIMALS, 4) };
}

export async function referencePrices(): Promise<ReferencePrice[]> {
  const tokens = await getTokens();
  const byId = new Map(tokens.map((row) => [row.assetId, row]));
  const usdc = byId.get(USDC_ASSET);
  const usdcPrice = usdc?.price && usdc.price > 0 ? usdc.price : 1;
  let rhea: { atoms: bigint; human: string } | null = null;
  try {
    rhea = await rheaNearPrice();
  } catch {
    rhea = null;
  }
  const out: ReferencePrice[] = [];
  for (const spec of Object.values(PAIRS)) {
    const row = byId.get(spec.baseAsset);
    if (!row?.price || row.price <= 0) continue;
    const usd = row.price / usdcPrice;
    // NEAR follows the on-chain Rhea NEAR/USDC pool: it moves with every trade there, while
    // 1Click prices refresh about once a minute and only to two decimals. Others use 1Click.
    const fromRhea = spec.id === "NEAR-USDC" && rhea !== null && rhea.atoms > 0n;
    const midAtoms = fromRhea ? rhea!.atoms : BigInt(Math.round(usd * 10 ** USDC_DECIMALS));
    if (midAtoms <= 0n) continue;
    out.push({
      pair: spec.id,
      midAtoms,
      mid: formatPrice(midAtoms),
      source: fromRhea ? "rhea:NEAR/USDC pool" : "1click:/v0/tokens",
      updatedAt: row.priceUpdatedAt,
      rheaMid: spec.id === "NEAR-USDC" ? rhea?.human : undefined,
    });
  }
  return out;
}

export interface QuoteRequest {
  dry: boolean;
  swapType: "EXACT_INPUT" | "EXACT_OUTPUT";
  slippageTolerance: number;
  originAsset: string;
  depositType: "ORIGIN_CHAIN" | "INTENTS";
  destinationAsset: string;
  amount: string;
  recipient: string;
  recipientType: "DESTINATION_CHAIN" | "INTENTS";
  refundTo: string;
  refundType: "ORIGIN_CHAIN" | "INTENTS";
  deadline: string;
  appFees?: { recipient: string; fee: number }[];
}

export async function oneclickQuote(request: QuoteRequest): Promise<unknown> {
  const { appFees: requestedFees, ...rest } = request;
  const jwtSet = Boolean(process.env.ONECLICK_JWT?.trim());
  const appFees = jwtSet ? (requestedFees ?? configuredAppFees()) : [];
  const body = appFees.length > 0 ? { ...rest, appFees } : rest;
  const res = await fetch(`${oneclickBase()}/v0/quote`, {
    method: "POST",
    headers: oneclickHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    json = { message: text };
  }
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "message" in json
        ? String((json as { message: unknown }).message)
        : text.slice(0, 300);
    throw new Error(`1Click quote ${res.status}: ${message}`);
  }
  return json;
}

export async function depositQuote(input: {
  usdcAmount: string;
  intentsAccount: string;
  refundTo: string;
  dry?: boolean;
  originAsset?: string;
}): Promise<unknown> {
  const atoms = parseAtoms(input.usdcAmount, USDC_DECIMALS);
  if (atoms == null || atoms <= 0n) throw new Error("Enter a USDC amount like 20");
  return oneclickQuote({
    dry: input.dry !== false,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: input.originAsset || BASE_USDC_ASSET,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: USDC_ASSET,
    amount: atoms.toString(),
    recipient: input.intentsAccount,
    recipientType: "INTENTS",
    refundTo: input.refundTo,
    refundType: "ORIGIN_CHAIN",
    deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
}

export async function withdrawQuote(input: {
  usdcAmount: string;
  intentsAccount: string;
  destinationAsset: string;
  recipient: string;
  dry?: boolean;
}): Promise<unknown> {
  const atoms = parseAtoms(input.usdcAmount, USDC_DECIMALS);
  if (atoms == null || atoms <= 0n) throw new Error("Enter a USDC amount like 20");
  return oneclickQuote({
    dry: input.dry !== false,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: USDC_ASSET,
    depositType: "INTENTS",
    destinationAsset: input.destinationAsset,
    amount: atoms.toString(),
    recipient: input.recipient,
    recipientType: "DESTINATION_CHAIN",
    refundTo: input.intentsAccount,
    refundType: "INTENTS",
    deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
}

export async function rheaSwapQuote(amountIn: bigint, tokenIn: string, tokenOut: string): Promise<unknown | null> {
  const url = new URL(RHEA_QUOTE_URL);
  url.searchParams.set("amountIn", amountIn.toString());
  url.searchParams.set("tokenIn", tokenIn);
  url.searchParams.set("tokenOut", tokenOut);
  url.searchParams.set("slippage", "0.005");
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  return res.json();
}

export async function fallbackQuote(input: {
  pair: PairId;
  side: Side;
  baseQty: bigint;
  account: string;
}): Promise<unknown> {
  const spec = PAIRS[input.pair];
  if (input.side === "BUY") {
    return oneclickQuote({
      dry: true,
      swapType: "EXACT_OUTPUT",
      slippageTolerance: 100,
      originAsset: USDC_ASSET,
      depositType: "INTENTS",
      destinationAsset: spec.baseAsset,
      amount: input.baseQty.toString(),
      recipient: input.account,
      recipientType: "INTENTS",
      refundTo: input.account,
      refundType: "INTENTS",
      deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
  }
  return oneclickQuote({
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: spec.baseAsset,
    depositType: "INTENTS",
    destinationAsset: USDC_ASSET,
    amount: input.baseQty.toString(),
    recipient: input.account,
    recipientType: "INTENTS",
    refundTo: input.account,
    refundType: "INTENTS",
    deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
}

export { activeFeeSchedule, configuredAppFees };

export async function depositStatus(depositAddress: string): Promise<unknown> {
  const url = new URL(`${oneclickBase()}/v0/status`);
  url.searchParams.set("depositAddress", depositAddress);
  const res = await fetch(url, { headers: oneclickHeaders(), signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { statusCode: res.status, message: text.slice(0, 300) };
  }
}
