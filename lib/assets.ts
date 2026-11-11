import { PAIR_IDS, type PairId } from "./types";

export const USDC_DECIMALS = 6;
export const USDC_ASSET =
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const USDC_CONTRACT =
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const BASE_USDC_ASSET =
  "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
export const INTENTS_CONTRACT = "intents.near";
export const REFERRAL = "intentbook.near";
export const ONECLICK_BASE = "https://1click.chaindefuser.com";
export const RHEA_QUOTE_URL = "https://smartx.rhea.finance/swapMultiDexPath";

export interface PairSpec {
  id: PairId;
  base: string;
  baseAsset: string;
  baseDecimals: number;
  lot: string;
  suggested: string;
}

export const PAIRS: Record<PairId, PairSpec> = {
  "BTC-USDC": {
    id: "BTC-USDC",
    base: "BTC",
    baseAsset: "nep141:btc.omft.near",
    baseDecimals: 8,
    lot: "0.0001",
    suggested: "0.0001",
  },
  "ETH-USDC": {
    id: "ETH-USDC",
    base: "ETH",
    baseAsset: "nep141:eth.omft.near",
    baseDecimals: 18,
    lot: "0.002",
    suggested: "0.002",
  },
  "SOL-USDC": {
    id: "SOL-USDC",
    base: "SOL",
    baseAsset: "nep141:sol.omft.near",
    baseDecimals: 9,
    lot: "0.1",
    suggested: "0.1",
  },
  "NEAR-USDC": {
    id: "NEAR-USDC",
    base: "NEAR",
    baseAsset: "nep141:wrap.near",
    baseDecimals: 24,
    lot: "2",
    suggested: "2",
  },
};

export function isPairId(value: string): value is PairId {
  return (PAIR_IDS as readonly string[]).includes(value);
}

export function pairByBase(symbol: string): PairId | null {
  const key = symbol.toUpperCase();
  if (key === "BTC") return "BTC-USDC";
  if (key === "ETH") return "ETH-USDC";
  if (key === "SOL") return "SOL-USDC";
  if (key === "NEAR") return "NEAR-USDC";
  return null;
}
