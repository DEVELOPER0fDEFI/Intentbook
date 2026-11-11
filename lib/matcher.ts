import type { Side } from "./types";

export interface MatchLot {
  id: string;
  side: Side;
  price: bigint;
  qty: bigint;
  createdAt: number;
  deadline: number;
  reservedUntil?: number;
}

export function selectLots(
  lots: readonly MatchLot[],
  taker: { side: Side; limit: bigint | null; qty: bigint; now: number },
): { taken: MatchLot[]; leftover: bigint } {
  if (taker.qty <= 0n) return { taken: [], leftover: taker.qty };
  const pool = lots.filter((lot) => {
    if (lot.qty <= 0n) return false;
    if (lot.deadline <= taker.now) return false;
    if ((lot.reservedUntil ?? 0) > taker.now) return false;
    if (taker.side === "BUY") {
      if (lot.side !== "SELL") return false;
      return taker.limit === null || lot.price <= taker.limit;
    }
    if (lot.side !== "BUY") return false;
    return taker.limit === null || lot.price >= taker.limit;
  });
  pool.sort((a, b) => {
    if (a.price !== b.price) {
      if (taker.side === "BUY") return a.price < b.price ? -1 : 1;
      return a.price > b.price ? -1 : 1;
    }
    return a.createdAt - b.createdAt;
  });
  let left = taker.qty;
  const taken: MatchLot[] = [];
  let blockedPrice: bigint | null = null;
  for (const lot of pool) {
    if (blockedPrice !== null && lot.price !== blockedPrice) break;
    if (lot.qty > left) {
      blockedPrice = lot.price;
      continue;
    }
    taken.push(lot);
    left -= lot.qty;
  }
  return { taken, leftover: left };
}
