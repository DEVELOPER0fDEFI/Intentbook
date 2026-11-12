"use client";

import { Receipt } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FillView } from "@/components/trade/types";
import { AssetMark } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { PAIR_IDS } from "@/lib/types";
import { cn } from "@/lib/cn";

type Trade = FillView & { takerAccount?: string; makerAccounts?: string[] };

export function ActivityScreen() {
  const [pair, setPair] = useState<string>("");
  const [trades, setTrades] = useState<Trade[] | null>(null);

  useEffect(() => {
    let stop = false;
    setTrades(null);
    const load = () =>
      fetch(`/api/v1/trades${pair ? `?pair=${pair}` : ""}`)
        .then((res) => (res.ok ? res.json() : { trades: [] }))
        .then((data) => {
          if (!stop) setTrades((data.trades ?? []) as Trade[]);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [pair]);

  const count = (kinds: string[]) => (trades ?? []).filter((trade) => kinds.includes(String(trade.settlement))).length;
  const stats = [
    { label: "Fills shown", value: trades ? String(trades.length) : "–" },
    { label: "Settled or sim passed", value: trades ? String(count(["broadcast", "executed"])) : "–" },
    { label: "Signed, unfunded", value: trades ? String(count(["unfunded"])) : "–" },
    { label: "Rejected", value: trades ? String(count(["rejected"])) : "–" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Activity"
        title={
          <>
            Every fill, <span className="italic text-lime">in public.</span>
          </>
        }
        description="Each match on the book with the result intents.near returned for it. One server orders the matches; this log is how anyone checks it."
      />

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4" role="tablist" aria-label="Filter by market">
        {["", ...PAIR_IDS].map((id) => (
          <button
            key={id || "all"}
            role="tab"
            aria-selected={pair === id}
            onClick={() => setPair(id)}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-2 rounded-sm border px-3 text-sm transition-colors",
              pair === id ? "border-lime/60 bg-lime/[0.05] text-ink" : "border-line text-muted hover:text-ink",
            )}
          >
            {id ? <AssetMark symbol={id.split("-")[0]!} size="sm" /> : null}
            {id ? id.replace("-", "/") : "All markets"}
          </button>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-panel px-4 py-3">
            <dt className="eyebrow !text-[0.625rem] text-muted">{stat.label}</dt>
            <dd className="font-display mt-1 text-4xl leading-none">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {trades === null ? (
        <Skeleton lines={6} />
      ) : trades.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-4" />}
          title="No fills yet"
          body="Fills appear here the moment an order crosses the book, with the raw mainnet result attached."
          action={
            <Button asChild variant="cream" size="sm">
              <Link href="/#terminal">Open the book</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-panel/90">
          {trades.map((trade) => {
            const symbol = String(trade.pair ?? "").split("-")[0] || "?";
            return (
              <li key={String(trade.id)} className="flex flex-wrap items-center gap-3 px-4 py-3 md:flex-nowrap">
                <AssetMark symbol={symbol} />
                <div className="min-w-0 flex-1">
                  <p className="nums text-sm">
                    {trade.baseQty} {symbol} <span className="text-faint">@</span> {trade.price}
                    <span className="text-muted"> · {trade.quoteQty} USDC</span>
                  </p>
                  <p className="nums mt-0.5 truncate text-[0.6875rem] text-muted">
                    {String(trade.createdAt ?? "").slice(0, 19).replace("T", " ")} UTC · fee {trade.takerFee ?? "0"} USDC
                  </p>
                </div>
                <Badge value={String(trade.settlement ?? trade.status)} />
                <div className="flex gap-2">
                  <Dialog
                    title="simulate_intents"
                    description="The raw mainnet view-call result for this batch."
                    trigger={
                      <Button size="sm" variant="outline">
                        Raw result
                      </Button>
                    }
                  >
                    <pre className="nums max-h-[60vh] overflow-auto rounded-sm bg-background p-3 text-xs leading-5">{JSON.stringify(trade.simulate, null, 2)}</pre>
                  </Dialog>
                  {trade.txHash && trade.explorer ? (
                    <Button asChild size="sm" variant="ghost">
                      <a href={trade.explorer} target="_blank" rel="noreferrer">
                        Transaction ↗︎
                      </a>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
