"use client";

import { useEffect, useState } from "react";

interface CompareBody {
  book?: { total?: string; fee?: string; quote?: string };
  oneclick?: { total?: string | null; error?: string | null };
  savings?: { quote?: string; bps?: string; bookBetter?: boolean; label?: string };
  fees?: { rules?: string; userPaysBps?: number; appFeeBps?: number };
}

export function PriceCompare({ pair, side, qty }: { pair: string; side: "BUY" | "SELL"; qty: string }) {
  const [body, setBody] = useState<CompareBody | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ pair, side, qty });
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
    }, 250);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [pair, side, qty]);

  return (
    <section id="price-compare" className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-sm">IntentBook book price vs 1Click price</h2>
      {error ? <p className="mt-2 text-sm text-ask">{error}</p> : null}
      {!body && !error ? <p className="mt-2 text-sm text-muted">Loading both prices.</p> : null}
      {body ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">IntentBook book</p>
            <p className="nums text-2xl">{body.book?.total ? `${body.book.total} USDC` : "-"}</p>
            <p className="text-xs text-muted">Includes taker fee {body.book?.fee ?? "0"} USDC</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">1Click</p>
            <p className="nums text-2xl">{body.oneclick?.total ? `${body.oneclick.total} USDC` : "-"}</p>
            <p className="text-xs text-muted">{body.oneclick?.error || `Model fee ${body.fees?.userPaysBps ?? "-"} bps`}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Savings</p>
            <p className={`nums text-2xl ${body.savings?.bookBetter ? "text-bid" : "text-ask"}`}>
              {body.savings?.quote ?? "0"} USDC
            </p>
            <p className="text-xs text-muted">
              {body.savings?.bps ?? "0"} bps. {body.savings?.label}
            </p>
          </div>
        </div>
      ) : null}
      {body?.fees?.rules ? <p className="mt-3 text-xs leading-5 text-muted">{body.fees.rules}</p> : null}
    </section>
  );
}
