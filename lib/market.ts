export const CANDLE_INTERVALS = {
  "1m": 60_000,
  "5m": 300_000,
  "1h": 3_600_000,
  "1d": 86_400_000,
} as const;

export type CandleInterval = keyof typeof CANDLE_INTERVALS;

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export function buildCandles(points: { t: number; price: number; qty: number }[], intervalMs: number): Candle[] {
  const buckets = new Map<number, Candle>();
  const ordered = [...points].sort((a, b) => a.t - b.t);
  for (const point of ordered) {
    if (!Number.isFinite(point.price) || point.price <= 0) continue;
    const t = Math.floor(point.t / intervalMs) * intervalMs;
    const row = buckets.get(t);
    if (!row) {
      buckets.set(t, { t, o: point.price, h: point.price, l: point.price, c: point.price, v: point.qty });
    } else {
      row.h = Math.max(row.h, point.price);
      row.l = Math.min(row.l, point.price);
      row.c = point.price;
      row.v += point.qty;
    }
  }
  return [...buckets.values()];
}

export function groupDepth(
  levels: { priceAtoms: bigint; qtyAtoms: bigint }[],
  groupAtoms: bigint,
): { priceAtoms: string; qtyAtoms: string }[] {
  const grouped = new Map<string, bigint>();
  for (const level of levels) {
    if (level.qtyAtoms <= 0n) continue;
    const bucket = groupAtoms > 0n ? (level.priceAtoms / groupAtoms) * groupAtoms : level.priceAtoms;
    const key = bucket.toString();
    grouped.set(key, (grouped.get(key) ?? 0n) + level.qtyAtoms);
  }
  return [...grouped.entries()].map(([priceAtoms, qtyAtoms]) => ({ priceAtoms, qtyAtoms: qtyAtoms.toString() }));
}

export function pickWinner(
  side: "BUY" | "SELL",
  legs: { venue: string; quoteAtoms: bigint; ok: boolean }[],
): string | null {
  const usable = legs.filter((leg) => leg.ok && leg.quoteAtoms > 0n);
  if (usable.length === 0) return null;
  usable.sort((a, b) => {
    if (a.quoteAtoms === b.quoteAtoms) return 0;
    if (side === "BUY") return a.quoteAtoms < b.quoteAtoms ? -1 : 1;
    return a.quoteAtoms > b.quoteAtoms ? -1 : 1;
  });
  return usable[0]?.venue ?? null;
}
