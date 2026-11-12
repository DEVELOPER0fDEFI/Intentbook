"use client";

import type { PlaceResult } from "@/components/trade/types";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

const STAMPS: Record<string, { label: string; className: string }> = {
  broadcast: { label: "Settled", className: "border-paper-green text-paper-green" },
  executed: { label: "Sim passed", className: "border-paper-green text-paper-green" },
  unfunded: { label: "Signed · unfunded", className: "border-paper-amber text-paper-amber" },
  rejected: { label: "Rejected", className: "border-paper-red text-paper-red" },
  resting: { label: "Resting", className: "border-paper-ink text-paper-ink" },
};

function Line({ label, value }: { label: string; value: string | undefined | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-paper-ink/25 py-1.5">
      <span className="eyebrow !text-[0.625rem] opacity-70">{label}</span>
      <span className="nums text-right text-xs">{value || "–"}</span>
    </div>
  );
}

/** Printed match receipt with a settlement stamp. */
export function MatchReceipt({ result, pair }: { result: PlaceResult; pair: string }) {
  const fill = result.fill ?? null;
  const resting = result.orders ?? [];
  const state = fill?.settlement ?? (resting.length ? "resting" : "rejected");
  const stamp = STAMPS[state] ?? STAMPS.rejected!;
  const base = pair.split("-")[0];
  return (
    <div className="receipt animate-rise relative mt-4 px-5 py-6 text-paper-ink">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-2xl italic leading-none">IntentBook</p>
        <p className="nums text-[0.625rem] opacity-70">{new Date(fill?.createdAt ?? Date.now()).toISOString().slice(0, 19).replace("T", " ")} UTC</p>
      </div>
      <p className="eyebrow mt-1 !text-[0.625rem] opacity-70">{fill ? "Match receipt" : "Order receipt"} · {pair.replace("-", "/")}</p>
      <div className="mt-4">
        {fill ? (
          <>
            <Line label="Size" value={`${fill.baseQty} ${base}`} />
            <Line label="Price" value={`${fill.price} USDC`} />
            <Line label="Quote" value={`${fill.quoteQty} USDC`} />
            <Line label="Taker fee" value={`${fill.takerFee ?? "0"} USDC`} />
            <Line label="Settlement" value={fill.txHash ? "execute_intents" : "simulate_intents"} />
          </>
        ) : null}
        {resting.map((order) => (
          <div key={order.id}>
            <Line label="Resting" value={`${order.side} ${order.qty} ${base} @ ${order.price}`} />
            <Line label="Expires" value={order.deadline?.slice(0, 19).replace("T", " ")} />
          </div>
        ))}
      </div>
      <span
        className={cn(
          "animate-stamp nums pointer-events-none absolute right-6 top-[4.25rem] rounded-sm border-2 px-2 py-1 text-[0.6875rem] font-medium uppercase tracking-[0.14em] opacity-90",
          stamp.className,
        )}
      >
        {stamp.label}
      </span>
      {fill?.note ? <p className="mt-3 text-[0.6875rem] leading-5 opacity-80">{fill.note}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {fill?.explorer ? (
          <a
            href={fill.explorer}
            target="_blank"
            rel="noreferrer"
            className="nums inline-flex min-h-9 items-center rounded-sm border border-paper-ink/40 px-3 text-[0.6875rem] uppercase tracking-[0.1em] hover:bg-paper-ink hover:text-paper"
          >
            {fill.txHash ? "Transaction ↗︎" : "intents.near ↗︎"}
          </a>
        ) : null}
        {fill?.simulate ? (
          <Dialog
            title="simulate_intents"
            description="The raw mainnet view-call result for this batch."
            trigger={
              <button
                type="button"
                className="nums inline-flex min-h-9 items-center rounded-sm border border-paper-ink/40 px-3 text-[0.6875rem] uppercase tracking-[0.1em] hover:bg-paper-ink hover:text-paper"
              >
                Raw result
              </button>
            }
          >
            <pre className="nums max-h-[60vh] overflow-auto rounded-sm bg-background p-3 text-xs leading-5">{JSON.stringify(fill.simulate, null, 2)}</pre>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}
