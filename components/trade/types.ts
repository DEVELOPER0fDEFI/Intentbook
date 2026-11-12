import type { SignStandard } from "@/lib/types";

export interface Level {
  price: string;
  priceAtoms?: string;
  qty: string;
  qtyAtoms?: string;
  total: string;
  orders: number;
}

export interface Book {
  pair: string;
  mid: string | null;
  source: string | null;
  rheaMid?: string | null;
  bestBid: string | null;
  bestAsk: string | null;
  spread: string | null;
  lot?: string;
  bids: Level[];
  asks: Level[];
  ts?: string;
}

export interface PreviewLeg {
  message: string;
  nonce: string;
  standard: SignStandard;
  baseQty: string;
  quoteQty: string;
  price: string;
  fee: string;
  deadline: string;
}

export interface Preview {
  previewId: string;
  warnings: string[];
  take: PreviewLeg | null;
  rest: PreviewLeg | null;
  fallback: unknown;
  fallbackError: string | null;
}

export interface FillView {
  id?: string;
  pair?: string;
  price?: string;
  baseQty?: string;
  quoteQty?: string;
  settlement?: string;
  status?: string;
  note?: string;
  simulate?: unknown;
  takerFee?: string | null;
  txHash?: string | null;
  explorer?: string;
  createdAt?: string;
}

export interface PlaceResult {
  ok?: boolean;
  error?: string;
  fill?: FillView | null;
  orders?: { id: string; side: string; qty: string; price: string; status: string; deadline: string }[];
  liveNote?: string;
}

export const STANDARD_LABEL: Record<SignStandard, string> = {
  nep413: "NEP-413",
  erc191: "ERC-191",
  raw_ed25519: "raw ed25519",
  webauthn: "WebAuthn",
};
