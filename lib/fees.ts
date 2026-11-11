import { divCeil } from "./closure";

/** Product taker fee. Maker fee stays zero. 8 bps is inside the 5-10 bps range. */
export const TAKER_FEE_BPS = 8n;
export const MAKER_FEE_BPS = 0n;

export function takerFeeAtoms(quoteAtoms: bigint, bps = TAKER_FEE_BPS): bigint {
  if (quoteAtoms <= 0n || bps <= 0n) return 0n;
  return divCeil(quoteAtoms * bps, 10_000n);
}

function add(into: Record<string, bigint>, token: string, amount: bigint) {
  if (amount === 0n) return;
  into[token] = (into[token] ?? 0n) + amount;
}

function toStrings(diff: Record<string, bigint>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of Object.keys(diff).sort()) {
    const amount = diff[token] ?? 0n;
    if (amount !== 0n) out[token] = amount.toString();
  }
  return out;
}

/**
 * Build the taker diff and the operator fee diff from maker diffs.
 * A buy pays the maker quote plus the fee. A sell receives the maker quote minus the fee.
 */
export function takerLeg(
  makerDiffs: Record<string, bigint>[],
  quoteAsset: string,
  bps = TAKER_FEE_BPS,
): { taker: Record<string, string>; operator: Record<string, string>; fee: bigint; quoteAbs: bigint } {
  const net: Record<string, bigint> = {};
  for (const diff of makerDiffs) {
    for (const [token, amount] of Object.entries(diff)) add(net, token, amount);
  }
  const taker: Record<string, bigint> = {};
  for (const [token, amount] of Object.entries(net)) add(taker, token, -amount);
  const quote = taker[quoteAsset] ?? 0n;
  const notional = quote < 0n ? -quote : quote;
  const fee = takerFeeAtoms(notional, bps);
  if (fee > 0n) {
    taker[quoteAsset] = quote - fee;
  }
  const quoteAfter = taker[quoteAsset] ?? 0n;
  const operator: Record<string, bigint> = {};
  if (fee > 0n) operator[quoteAsset] = fee;
  return {
    taker: toStrings(taker),
    operator: toStrings(operator),
    fee,
    quoteAbs: quoteAfter < 0n ? -quoteAfter : quoteAfter,
  };
}
