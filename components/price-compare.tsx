"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";

interface CompareBody {
  book?: { total?: string; fee?: string; quote?: string; unfilled?: string };
  oneclick?: { total?: string | null; error?: string | null; estimated?: boolean };
  savings?: { quote?: string; bps?: string; bookBetter?: boolean; label?: string };
  fees?: { rules?: string; userPaysBps?: number; appFeeBps?: number };
}

const num = (value?: string | null) => Number((value ?? "").replace(/,/g, "")) || 0;

/** Best-execution check: the same size on this book versus NEAR Intents 1Click. */
export function PriceCompare({ pair, side, qty }: { pair: string; side: "BUY" | "SELL"; qty: string }) {
  const [body, setBody] = useState<CompareBody | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ pair, side, qty: qty || "0" });
      fetch(`/api/v1/compare?${params}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Comparison failed");
          if (!stop) {
            setBody(data);
            setError("");
          }
        })
        .catch((err: Error) => {
          if (!stop) setError(err.message);
        });
    }, 300);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [pair, side, qty]);

  const bookTotal = num(body?.book?.total);
  const otherTotal = num(body?.oneclick?.total);
  const max = Math.max(bookTotal, otherTotal, 1);
  const better = body?.savings?.bookBetter;
  const rows = [
    { name: "IntentBook", value: body?.book?.total, width: (bookTotal / max) * 100, note: `incl. ${body?.book?.fee ?? "0"} USDC taker fee`, win: better === true },
    {
      name: "1Click",
      value: body?.oneclick?.total,
      width: (otherTotal / max) * 100,
      note: body?.oneclick?.estimated ? `${body?.fees?.userPaysBps ?? "–"} bps fee model` : body?.oneclick?.error || "live dry quote",
      win: better === false && otherTotal > 0,
    },
  ];

  return (
    <section id="price-compare" className="rounded-[var(--radius-panel)] border border-line bg-panel/90" aria-label="Best execution check">
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line px-4">
        <p className="eyebrow text-muted">
          Best execution · {side === "BUY" ? "cost to buy" : "proceeds to sell"} {qty || "0"} {pair.split("-")[0]}
        </p>
        {body?.savings ? (
          <span className={cn("nums text-[0.6875rem]", better ? "text-bid" : "text-muted")}>
            {better ? `book wins by ${body.savings.bps} bps` : body.savings.label}
          </span>
        ) : null}
      </header>
      <div className="space-y-3 p-4">
        {error ? <p className="text-sm text-ask">{error}</p> : null}
        {!body && !error ? <Skeleton lines={2} /> : null}
        {body
          ? rows.map((row) => (
              <div key={row.name}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className={cn("font-medium", row.win ? "text-ink" : "text-muted")}>{row.name}</span>
                  <span className="nums">{row.value ? `${row.value} USDC` : "–"}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel-3">
                  <div className={cn("h-full rounded-full transition-[width] duration-700", row.win ? "bg-lime" : "bg-line-strong")} style={{ width: `${row.width}%` }} />
                </div>
                <p className="nums mt-1 text-[0.625rem] text-faint">{row.note}</p>
              </div>
            ))
          : null}
        {body?.book?.unfilled && body.book.unfilled !== "0" ? (
          <p className="text-[0.6875rem] leading-5 text-gold">{body.book.unfilled} would not fill on the book in whole lots.</p>
        ) : null}
      </div>
    </section>
  );
}
