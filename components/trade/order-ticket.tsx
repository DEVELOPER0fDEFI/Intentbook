"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { MatchReceipt } from "@/components/trade/receipt";
import { STANDARD_LABEL, type Book, type PlaceResult, type Preview, type PreviewLeg } from "@/components/trade/types";
import { useWallet } from "@/components/wallet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PAIRS } from "@/lib/assets";
import { shortAccount } from "@/lib/format";
import type { PairId, Side } from "@/lib/types";
import { cn } from "@/lib/cn";

/** lot × n as a decimal string, without float drift. */
function multiplyDecimal(lot: string, n: number): string {
  const [whole, frac = ""] = lot.split(".");
  const scaled = BigInt(`${whole}${frac}`) * BigInt(n);
  if (!frac) return scaled.toString();
  const text = scaled.toString().padStart(frac.length + 1, "0");
  const out = `${text.slice(0, -frac.length)}.${text.slice(-frac.length)}`.replace(/\.?0+$/, "");
  return out || "0";
}

function LegCard({ kind, leg, base }: { kind: "take" | "rest"; leg: PreviewLeg; base: string }) {
  let pretty = leg.message;
  try {
    pretty = JSON.stringify(JSON.parse(leg.message), null, 2);
  } catch {
    // Show the raw message.
  }
  return (
    <div className="rounded-sm border border-line bg-background/60">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <span className="eyebrow !text-[0.625rem] text-lime">{kind === "take" ? "Take now" : "Rest on the book"}</span>
        <span className="nums text-[0.6875rem] text-muted">{STANDARD_LABEL[leg.standard]}</span>
      </div>
      <p className="nums border-t border-line px-3 py-2 text-xs leading-5">
        {leg.baseQty} {base} @ {leg.price} = {leg.quoteQty} USDC
        {kind === "take" ? ` · fee ${leg.fee}` : ` · until ${leg.deadline.slice(11, 19)} UTC`}
      </p>
      <details className="group border-t border-line">
        <summary className="nums flex min-h-9 cursor-pointer list-none items-center px-3 text-[0.6875rem] text-muted hover:text-ink">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span> Exact payload you sign
        </summary>
        <pre className="nums max-h-64 overflow-auto px-3 pb-3 text-[0.6875rem] leading-5 text-ink/85">{pretty}</pre>
      </details>
    </div>
  );
}

export function OrderTicket({
  pair,
  side,
  setSide,
  orderType,
  setOrderType,
  qty,
  setQty,
  price,
  setPrice,
  book,
  busy,
  phase,
  error,
  notice,
  draft,
  result,
  onPlain,
  onSubmit,
  className,
}: {
  pair: PairId;
  side: Side;
  setSide: (side: Side) => void;
  orderType: "LIMIT" | "MARKET";
  setOrderType: (type: "LIMIT" | "MARKET") => void;
  qty: string;
  setQty: (qty: string) => void;
  price: string;
  setPrice: (price: string) => void;
  book: Book | null;
  busy: boolean;
  phase?: string;
  error: string;
  notice?: string;
  draft: Preview | null;
  result: PlaceResult | null;
  onPlain: (text: string) => void;
  onSubmit: (sign: boolean) => void;
  className?: string;
}) {
  const wallet = useWallet();
  const [plain, setPlain] = useState("");
  const spec = PAIRS[pair];
  const lot = book?.lot ?? spec.lot;
  const best = side === "BUY" ? book?.bestAsk : book?.bestBid;
  const effective = orderType === "MARKET" ? best : price || best;
  const notional = Number(qty) * Number((effective ?? "").replace(/,/g, ""));
  const crosses =
    orderType === "MARKET" ||
    (best != null && price !== "" && (side === "BUY" ? Number(price) >= Number(best) : Number(price) <= Number(best)));
  const tone = side === "BUY" ? "bid" : "ask";

  return (
    <section className={cn("rounded-[var(--radius-panel)] border border-line bg-panel/90", className)} aria-label="Order ticket">
      <header className="flex min-h-11 items-center justify-between border-b border-line px-4">
        <p className="eyebrow text-muted">Order ticket</p>
        <p className="nums text-[0.6875rem] text-faint">
          {wallet.session ? `${STANDARD_LABEL[wallet.standard]} · ${shortAccount(wallet.session.accountId)}` : "no signer"}
        </p>
      </header>
      <div className="space-y-4 p-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onPlain(plain);
          }}
          className="flex items-center gap-2 rounded-sm border border-line-strong bg-background/60 pl-3 focus-within:border-lime"
        >
          <Sparkles className="size-4 shrink-0 text-lime" aria-hidden />
          <input
            aria-label="Type an order in plain language"
            value={plain}
            onChange={(event) => setPlain(event.target.value)}
            placeholder="buy 0.0001 btc at 90k"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <button type="submit" className="eyebrow h-11 px-3 !text-[0.625rem] text-muted hover:text-ink">
            Fill
          </button>
        </form>

        <div className="grid grid-cols-2 rounded-sm border border-line-strong p-1" role="radiogroup" aria-label="Side">
          {(["BUY", "SELL"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={side === value}
              onClick={() => setSide(value)}
              className={cn(
                "h-10 rounded-[2px] text-sm font-medium transition-colors",
                side === value ? (value === "BUY" ? "bg-bid text-background" : "bg-ask text-background") : "text-muted hover:text-ink",
              )}
            >
              {value === "BUY" ? "Buy" : "Sell"} {spec.base}
            </button>
          ))}
        </div>

        <div className="flex gap-5 border-b border-line" role="tablist" aria-label="Order type">
          {(["LIMIT", "MARKET"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={orderType === value}
              onClick={() => setOrderType(value)}
              className={cn("relative -mb-px min-h-10 text-sm", orderType === value ? "text-ink" : "text-muted hover:text-ink")}
            >
              {value === "LIMIT" ? "Limit" : "Market"}
              <span className={cn("absolute inset-x-0 bottom-0 h-0.5 bg-lime", orderType === value ? "opacity-100" : "opacity-0")} />
            </button>
          ))}
        </div>

        <Field
          label={`Amount · ${spec.base}`}
          htmlFor="qty"
          hint={
            <span className="flex gap-1">
              {[1, 2, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQty(multiplyDecimal(lot, n))}
                  className="nums min-h-7 rounded-sm border border-line px-2 text-[0.625rem] text-muted hover:border-line-strong hover:text-ink"
                >
                  {n === 1 ? `1 lot` : `${n}×`}
                </button>
              ))}
            </span>
          }
        >
          <Input id="qty" className="nums" value={qty} inputMode="decimal" onChange={(event) => setQty(event.target.value)} />
        </Field>

        {orderType === "LIMIT" ? (
          <Field
            label="Limit price · USDC"
            htmlFor="price"
            hint={
              best ? (
                <button type="button" onClick={() => setPrice(best)} className="nums min-h-7 text-[0.625rem] uppercase tracking-[0.12em] text-lime">
                  {side === "BUY" ? "best ask" : "best bid"} {best}
                </button>
              ) : null
            }
          >
            <Input id="price" className="nums" placeholder={best ?? "price"} value={price} inputMode="decimal" onChange={(event) => setPrice(event.target.value)} />
          </Field>
        ) : (
          <p className="rounded-sm border border-dashed border-line-strong px-3 py-2.5 text-xs leading-5 text-muted">
            Market takes whole maker lots from the book. Size it cannot fill is quoted on 1Click and Rhea for comparison, not executed.
          </p>
        )}

        <dl className="nums space-y-1.5 border-y border-line py-3 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Estimated value</dt>
            <dd>{Number.isFinite(notional) && notional > 0 ? `≈ ${notional.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC` : "–"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Fee</dt>
            <dd>{crosses ? "8 bps taker" : "0 bps maker, if it rests"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Lot</dt>
            <dd>
              {lot} {spec.base}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Custody</dt>
            <dd className="text-lime">your intents.near account</dd>
          </div>
        </dl>

        {error ? (
          <p role="alert" className="rounded-sm border border-ask/40 bg-ask/[0.07] px-3 py-2 text-sm text-ask">
            {error}
          </p>
        ) : null}

        {notice ? (
          <p role="status" className="rounded-sm border border-gold/40 bg-gold/[0.07] px-3 py-2 text-sm leading-6 text-gold">
            {notice}
          </p>
        ) : null}

        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onSubmit(false)}>
            Preview
          </Button>
          <Button type="button" variant={tone} size="default" disabled={busy} onClick={() => onSubmit(true)}>
            {busy ? phase || "Working…" : `Sign & ${side === "BUY" ? "buy" : "sell"} ${qty || "0"} ${spec.base}`}
          </Button>
        </div>

        {draft ? (
          <div className="animate-rise space-y-2">
            <p className="eyebrow text-muted">What you sign</p>
            {draft.take ? <LegCard kind="take" leg={draft.take} base={spec.base} /> : null}
            {draft.rest ? <LegCard kind="rest" leg={draft.rest} base={spec.base} /> : null}
            {draft.warnings.map((warning) => (
              <p key={warning} className="text-xs leading-5 text-muted">
                {warning}
              </p>
            ))}
            {draft.fallbackError ? <p className="text-xs text-ask">1Click: {draft.fallbackError}</p> : null}
          </div>
        ) : null}

        {result ? <MatchReceipt result={result} pair={pair} /> : null}
      </div>
    </section>
  );
}
