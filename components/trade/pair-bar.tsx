"use client";

import type { TickerRow } from "@/components/site/use-market";
import { changePct } from "@/components/site/use-market";
import { AssetMark } from "@/components/ui/asset-mark";
import { PAIRS } from "@/lib/assets";
import type { PairId } from "@/lib/types";
import { cn } from "@/lib/cn";

function Spark({ points, up }: { points: { mid: number }[]; up: boolean }) {
  if (points.length < 2) return <span className="block h-6 w-16" />;
  const values = points.map((point) => point.mid);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const path = values.map((value, index) => `${(index / (values.length - 1)) * 64},${22 - ((value - min) / span) * 20}`).join(" ");
  return (
    <svg viewBox="0 0 64 24" className="h-6 w-16" aria-hidden>
      <polyline fill="none" stroke={up ? "var(--color-bid)" : "var(--color-ask)"} strokeWidth="1.5" points={path} />
    </svg>
  );
}

export function PairBar({ pair, rows, onSelect }: { pair: PairId; rows: TickerRow[]; onSelect: (pair: PairId) => void }) {
  return (
    <div className="scrollbar-none -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Markets">
      {(Object.keys(PAIRS) as PairId[]).map((id) => {
        const row = rows.find((item) => item.pair === id);
        const pct = row ? changePct(row.history) : null;
        const active = id === pair;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(id)}
            className={cn(
              "group flex min-h-16 min-w-[11.5rem] snap-start items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors",
              active ? "border-lime/60 bg-lime/[0.05]" : "border-line bg-panel/70 hover:border-line-strong",
            )}
          >
            <AssetMark symbol={PAIRS[id].base} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1 text-sm font-medium">
                {PAIRS[id].base}
                <span className="text-xs font-normal text-faint">/USDC</span>
              </span>
              <span className="nums block text-xs text-muted">
                {row?.mid ? `$${row.mid}` : "…"}
                {pct === null || Math.abs(pct) < 0.005 ? null : <span className={cn("ml-1.5", pct >= 0 ? "text-bid" : "text-ask")}>{`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}</span>}
              </span>
            </span>
            <Spark points={row?.history ?? []} up={(pct ?? 0) >= 0} />
          </button>
        );
      })}
    </div>
  );
}
