"use client";

import { useMemo, useState } from "react";
import type { Book, Level } from "@/components/trade/types";
import { Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";

const toNumber = (value: string) => Number(value.replace(/,/g, "")) || 0;

function Row({ level, tone, max, onPick }: { level: Level; tone: "bid" | "ask"; max: number; onPick: (price: string) => void }) {
  const width = Math.min(100, (toNumber(level.total) / max) * 100);
  return (
    <button
      type="button"
      onClick={() => onPick(level.price)}
      title={`Use ${level.price} as the limit price`}
      // Remounts when the size at this price changes, which replays the flash.
      className={cn("group relative block min-h-8 w-full px-3 text-left transition-colors hover:bg-panel-3", tone === "bid" ? "animate-flash-bid" : "animate-flash-ask")}
    >
      <span
        className={cn("absolute inset-y-0.5 right-0 rounded-l-[2px]", tone === "ask" ? "bg-ask/[0.13]" : "bg-bid/[0.13]")}
        style={{ width: `${width}%` }}
      />
      <span className="nums relative grid grid-cols-[1.1fr_1fr_1fr] items-center py-1.5 text-xs">
        <span className={tone === "ask" ? "text-ask" : "text-bid"}>{level.price}</span>
        <span className="text-right">{level.qty}</span>
        <span className="text-right text-muted group-hover:text-ink">{level.total}</span>
      </span>
    </button>
  );
}

export function BookLadder({ book, base, onPick, className }: { book: Book | null; base: string; onPick: (price: string) => void; className?: string }) {
  const asks = useMemo(() => [...(book?.asks ?? [])].reverse(), [book]);
  const max = useMemo(() => Math.max(1, ...[...(book?.bids ?? []), ...(book?.asks ?? [])].map((level) => toNumber(level.total))), [book]);
  const mid = book?.mid ? toNumber(book.mid) : 0;
  // Direction of the last change in the reference mid, for the tick arrow and flash.
  const pair = book?.pair ?? "";
  const [tick, setTick] = useState<{ pair: string; mid: number; dir: "up" | "down" | null }>({ pair: "", mid: 0, dir: null });
  if (mid && (mid !== tick.mid || pair !== tick.pair)) {
    // A new market starts without a direction; only moves within one market count.
    setTick({ pair, mid, dir: tick.mid && pair === tick.pair ? (mid > tick.mid ? "up" : "down") : null });
  }
  const spreadBps = book?.spread && mid ? (toNumber(book.spread) / mid) * 10_000 : null;

  return (
    <section className={cn("flex flex-col rounded-[var(--radius-panel)] border border-line bg-panel/90", className)} aria-label="Order book">
      <header className="flex min-h-11 items-center justify-between border-b border-line px-3">
        <p className="eyebrow text-muted">Order book</p>
        <p className="nums text-[0.625rem] text-faint">tap a price to use it</p>
      </header>
      <div className="nums grid grid-cols-[1.1fr_1fr_1fr] px-3 py-2 text-[0.625rem] uppercase tracking-[0.12em] text-faint">
        <span>Price</span>
        <span className="text-right">Size {base}</span>
        <span className="text-right">Sum USDC</span>
      </div>
      {!book ? (
        <div className="space-y-5 p-3">
          <Skeleton lines={6} />
          <Skeleton lines={6} />
        </div>
      ) : asks.length === 0 && book.bids.length === 0 ? (
        <p className="px-3 py-10 text-center text-xs leading-5 text-muted">The book is quiet. The maker ladder appears when reference prices load.</p>
      ) : (
        <>
          <div className="flex flex-1 flex-col justify-end">
            {asks.map((level) => (
              <Row key={`a-${level.price}-${level.qty}`} level={level} tone="ask" max={max} onPick={onPick} />
            ))}
          </div>
          <div
            key={book.mid ?? "mid"}
            className={cn(
              "my-1 flex items-center justify-between gap-2 border-y border-line bg-background/60 px-3 py-2.5",
              tick.dir === "up" ? "animate-flash-bid" : tick.dir === "down" ? "animate-flash-ask" : "",
            )}
          >
            <span className="font-display flex items-baseline gap-2 text-2xl leading-none">
              {book.mid ? `${book.mid}` : "–"}
              {tick.dir ? (
                <span aria-label={tick.dir === "up" ? "up" : "down"} className={cn("nums text-sm", tick.dir === "up" ? "text-bid" : "text-ask")}>
                  {tick.dir === "up" ? "▲" : "▼"}
                </span>
              ) : null}
            </span>
            <span className="nums text-right text-[0.625rem] uppercase tracking-[0.12em] text-muted">
              spread {book.spread ?? "–"}
              {spreadBps !== null ? <span className="block text-lime">{spreadBps.toFixed(1)} bps</span> : null}
            </span>
          </div>
          <div className="flex-1">
            {book.bids.map((level) => (
              <Row key={`b-${level.price}-${level.qty}`} level={level} tone="bid" max={max} onPick={onPick} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
