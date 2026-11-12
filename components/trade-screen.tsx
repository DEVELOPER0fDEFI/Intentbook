"use client";

import { Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { PriceCompare } from "@/components/price-compare";
import { useTicker } from "@/components/site/use-market";
import { BookLadder } from "@/components/trade/book-ladder";
import { MidChart } from "@/components/trade/mid-chart";
import { OrderTicket } from "@/components/trade/order-ticket";
import { PairBar } from "@/components/trade/pair-bar";
import type { Book, FillView, PlaceResult, Preview } from "@/components/trade/types";
import { useWallet } from "@/components/wallet";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { PAIRS } from "@/lib/assets";
import { parsePlain } from "@/lib/parse";
import type { PairId, Side } from "@/lib/types";
import { cn } from "@/lib/cn";

type Pane = "book" | "ticket" | "market";

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function MatchTape({ trades, base }: { trades: FillView[]; base: string }) {
  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-panel/90" aria-label="Recent matches">
      <header className="flex min-h-11 items-center justify-between border-b border-line px-4">
        <p className="eyebrow text-muted">Recent matches</p>
        <p className="nums text-[0.625rem] text-faint">every fill is simulated on mainnet</p>
      </header>
      {trades.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-4" />}
          title="No matches on this market yet"
          body="Buy at the best ask or sell at the best bid to cross the maker ladder. The batch is checked with simulate_intents."
        />
      ) : (
        <ul className="divide-y divide-line">
          {trades.slice(0, 7).map((trade) => (
            <li key={String(trade.id)} className="nums flex min-h-11 items-center justify-between gap-3 px-4 text-xs">
              <span className="w-8 shrink-0 text-faint">{timeAgo(trade.createdAt)}</span>
              <span className="flex-1">
                {trade.baseQty} {base} <span className="text-faint">@</span> {trade.price}
              </span>
              <Badge value={String(trade.settlement ?? trade.status)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TradeScreen({ referrer = "", compact = false }: { referrer?: string; compact?: boolean }) {
  const [pair, setPair] = useState<PairId>("BTC-USDC");
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [qty, setQty] = useState(PAIRS["BTC-USDC"].lot);
  const [price, setPrice] = useState("");
  const [book, setBook] = useState<Book | null>(null);
  const [trades, setTrades] = useState<FillView[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Preview | null>(null);
  const [result, setResult] = useState<PlaceResult | null>(null);
  const [pane, setPane] = useState<Pane>("book");
  const [updated, setUpdated] = useState<number | null>(null);
  const ticker = useTicker(5000);
  const wallet = useWallet();
  const account = wallet.session?.accountId ?? "";
  const row = ticker.find((item) => item.pair === pair);

  async function refresh(next = pair) {
    const [bookRes, tradeRes] = await Promise.all([fetch(`/api/v1/book?pair=${next}`), fetch(`/api/v1/trades?pair=${next}`)]);
    if (bookRes.ok) {
      setBook(await bookRes.json());
      setUpdated(Date.now());
    }
    if (tradeRes.ok) setTrades(((await tradeRes.json()).trades ?? []) as FillView[]);
  }

  useEffect(() => {
    setBook(null);
    refresh().catch(() => setError("The book API is not responding yet."));
    const timer = setInterval(() => refresh().catch(() => undefined), 3000);
    const stream = new EventSource(`/api/v1/stream?pair=${pair}`);
    stream.onmessage = () => refresh().catch(() => undefined);
    return () => {
      clearInterval(timer);
      stream.close();
    };
    // refresh closes over the current pair via the argument default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair]);

  function selectPair(next: PairId) {
    setPair(next);
    setQty(PAIRS[next].lot);
    setPrice("");
    setDraft(null);
    setResult(null);
  }

  function applyPlain(text: string) {
    const parsed = parsePlain(text);
    if (!parsed) {
      setError('Try a sentence like "buy 0.0001 btc at 90k" or "sell 2 near at market".');
      return;
    }
    if (parsed.pair !== pair) selectPair(parsed.pair);
    setSide(parsed.side);
    setQty(parsed.qty);
    setOrderType(parsed.orderType);
    setPrice(parsed.price ?? "");
    setError("");
    setPane("ticket");
  }

  async function submit(sign: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    setResult(null);
    try {
      if (!account) throw new Error("Choose a signer first: the demo key works without a wallet.");
      setPhase("Building order…");
      const limit = price || (side === "BUY" ? book?.bestAsk : book?.bestBid) || "";
      const previewRes = await fetch("/api/v1/orders/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account,
          pair,
          side,
          orderType,
          qty,
          price: orderType === "MARKET" ? undefined : limit,
          standard: wallet.standard,
          referrer: referrer || undefined,
        }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) throw new Error(preview.error || "Could not build the order");
      setDraft(preview);
      if (!sign) return;
      setPhase("Waiting for signature…");
      const body: Record<string, unknown> = { previewId: preview.previewId };
      if (preview.take) body.take = await wallet.signLeg(preview.take);
      if (preview.rest) body.rest = await wallet.signLeg(preview.rest);
      setPhase("Simulating on mainnet…");
      const placed = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await placed.json()) as PlaceResult;
      if (!placed.ok) throw new Error(data.error || "Could not place the order");
      if (data.ok !== false && !data.fill && !(data.orders?.length)) {
        setNotice(
          `Nothing matched. The book fills whole maker lots only, and no lot fits ${qty} ${PAIRS[pair].base} right now. Try a larger size, or rest a limit order. The 1Click comparison above is a quote only.`,
        );
      } else {
        setResult(data);
      }
      if (data.ok === false && data.error) setError(data.error);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  const base = PAIRS[pair].base;
  const panes: { id: Pane; label: string }[] = [
    { id: "book", label: "Book" },
    { id: "ticket", label: "Trade" },
    { id: "market", label: "Market" },
  ];

  return (
    <section id="terminal" className={cn("scroll-mt-24", compact ? "" : "pt-10")}>
      {compact ? null : (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel tone="lime">Terminal</SectionLabel>
            <h2 className="font-display mt-1 text-4xl leading-none sm:text-5xl">The book, live.</h2>
          </div>
          <p className="nums flex items-center gap-2 text-[0.6875rem] text-muted">
            <span className="animate-pulse-dot size-1.5 rounded-full bg-bid text-bid" />
            streaming · {updated ? new Date(updated).toISOString().slice(11, 19) : "–"} UTC
          </p>
        </div>
      )}

      <PairBar pair={pair} rows={ticker} onSelect={selectPair} />

      <div className="sticky top-16 z-30 -mx-4 mt-3 border-y border-line bg-background/90 px-4 py-2 backdrop-blur-md md:hidden">
        <div className="grid grid-cols-3 rounded-sm border border-line-strong p-1" role="tablist" aria-label="Terminal view">
          {panes.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={pane === item.id}
              onClick={() => setPane(item.id)}
              className={cn("h-9 rounded-[2px] text-sm", pane === item.id ? "bg-ink text-background" : "text-muted")}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-[minmax(290px,0.85fr)_minmax(0,1.25fr)_minmax(320px,0.95fr)]">
        <BookLadder
          book={book}
          base={base}
          className={cn("md:order-1", pane === "book" ? "" : "hidden md:flex")}
          onPick={(value) => {
            setOrderType("LIMIT");
            setPrice(value);
            setPane("ticket");
          }}
        />
        <div className={cn("space-y-3 md:order-3 md:col-span-2 lg:order-2 lg:col-span-1", pane === "market" ? "" : "hidden md:block")}>
          <MidChart points={row?.history ?? []} mid={book?.mid ?? row?.mid ?? null} source={book?.source ?? null} rheaMid={book?.rheaMid} base={base} />
          <PriceCompare pair={pair} side={side} qty={qty} />
          <MatchTape trades={trades} base={base} />
        </div>
        <OrderTicket
          className={cn("md:order-2 lg:order-3 lg:sticky lg:top-20 lg:self-start", pane === "ticket" ? "" : "hidden md:block")}
          pair={pair}
          side={side}
          setSide={setSide}
          orderType={orderType}
          setOrderType={setOrderType}
          qty={qty}
          setQty={setQty}
          price={price}
          setPrice={setPrice}
          book={book}
          busy={busy}
          phase={phase}
          error={error}
          notice={notice}
          draft={draft}
          result={result}
          onPlain={applyPlain}
          onSubmit={(sign) => void submit(sign)}
        />
      </div>
    </section>
  );
}
