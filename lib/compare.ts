import { takerFeeAtoms } from "./fees";
import { quoteAtomsForBase } from "./format";

export interface BookLevel {
  priceAtoms: bigint;
  qtyAtoms: bigint;
}

export interface BookWalk {
  filled: bigint;
  unfilled: bigint;
  quote: bigint;
  fee: bigint;
  total: bigint;
}

export function walkBook(input: {
  side: "BUY" | "SELL";
  qty: bigint;
  levels: BookLevel[];
  baseDecimals: number;
  takerFeeBps: bigint;
}): BookWalk {
  let left = input.qty;
  let quote = 0n;
  for (const level of input.levels) {
    if (left <= 0n || level.qtyAtoms <= 0n || level.priceAtoms <= 0n) continue;
    const take = level.qtyAtoms < left ? level.qtyAtoms : left;
    quote += quoteAtomsForBase(take, level.priceAtoms, input.baseDecimals);
    left -= take;
  }
  const filled = input.qty - left;
  const fee = takerFeeAtoms(quote, input.takerFeeBps);
  const signed = input.side === "BUY" ? quote + fee : quote - fee;
  return { filled, unfilled: left, quote, fee, total: signed > 0n ? signed : 0n };
}

/** Positive delta means the book is the better price for the user. */
export function priceEdge(input: { side: "BUY" | "SELL"; bookQuote: bigint; otherQuote: bigint }): {
  delta: bigint;
  bps: bigint;
  bookBetter: boolean;
} {
  if (input.bookQuote <= 0n || input.otherQuote <= 0n) return { delta: 0n, bps: 0n, bookBetter: false };
  const delta = input.side === "BUY" ? input.otherQuote - input.bookQuote : input.bookQuote - input.otherQuote;
  const basis = input.side === "BUY" ? input.otherQuote : input.bookQuote;
  const bps = basis > 0n ? (delta * 10_000n) / basis : 0n;
  return { delta, bps, bookBetter: delta > 0n };
}

export function readQuoteAmounts(quote: unknown): { amountIn: bigint; amountOut: bigint; amountInFormatted: string; amountOutFormatted: string } {
  const root = quote && typeof quote === "object" ? (quote as { quote?: Record<string, unknown> }) : {};
  const body = (root.quote ?? root) as Record<string, unknown>;
  const amountIn = typeof body.amountIn === "string" ? BigInt(body.amountIn) : 0n;
  const amountOut = typeof body.amountOut === "string" ? BigInt(body.amountOut) : 0n;
  return {
    amountIn,
    amountOut,
    amountInFormatted: typeof body.amountInFormatted === "string" ? body.amountInFormatted : "",
    amountOutFormatted: typeof body.amountOutFormatted === "string" ? body.amountOutFormatted : "",
  };
}
