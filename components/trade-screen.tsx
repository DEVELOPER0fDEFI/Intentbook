"use client";

import { useEffect, useMemo, useState } from "react";
import { PAIRS } from "@/lib/assets";
import type { PairId } from "@/lib/types";
import { PriceCompare } from "@/components/price-compare";
import { useWallet } from "@/components/wallet";
import { parsePlain } from "@/lib/parse";
import { shortAccount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Side } from "@/lib/types";

interface Level {
  price: string;
  qty: string;
  total: string;
  orders: number;
}

interface Book {
  pair: string;
  mid: string | null;
  source: string | null;
  rheaMid?: string | null;
  bestBid: string | null;
  bestAsk: string | null;
  spread: string | null;
  bids: Level[];
  asks: Level[];
}

interface Point {
  t: number;
  mid: number;
}

interface PreviewLeg {
  message: string;
  nonce: string;
  standard: "nep413" | "erc191";
  baseQty: string;
  quoteQty: string;
  price: string;
  fee: string;
  deadline: string;
}

interface Preview {
  previewId: string;
  warnings: string[];
  take: PreviewLeg | null;
  rest: PreviewLeg | null;
  fallback: unknown;
  fallbackError: string | null;
}

export function TradeScreen({ referrer = "" }: { referrer?: string }) {
  const [pair, setPair] = useState<PairId>("BTC-USDC");
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [qty, setQty] = useState(PAIRS["BTC-USDC"].suggested);
  const [price, setPrice] = useState("");
  const [plain, setPlain] = useState("");
  const [book, setBook] = useState<Book | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [trades, setTrades] = useState<Record<string, unknown>[]>([]);
  const [mids, setMids] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Preview | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const wallet = useWallet();
  const account = wallet.session?.accountId ?? "";

  async function refresh(next = pair) {
    const [bookRes, tickerRes, tradeRes] = await Promise.all([
      fetch(`/api/v1/book?pair=${next}`),
      fetch("/api/v1/ticker"),
      fetch(`/api/v1/trades?pair=${next}`),
    ]);
    if (bookRes.ok) setBook(await bookRes.json());
    if (tickerRes.ok) {
      const ticker = await tickerRes.json();
      const rows = (ticker.pairs ?? []) as { pair: string; mid: string | null; history: Point[] }[];
      setMids(Object.fromEntries(rows.map((row) => [row.pair, row.mid ?? ""])));
      setHistory(rows.find((row) => row.pair === next)?.history ?? []);
    }
    if (tradeRes.ok) {
      const body = await tradeRes.json();
      setTrades(body.trades ?? []);
    }
  }

  useEffect(() => {
    refresh().catch(() => setError("The book API is not responding yet."));
    const timer = setInterval(() => refresh().catch(() => undefined), 2500);
    const stream = new EventSource("/api/v1/stream");
    stream.onmessage = () => refresh().catch(() => undefined);
    return () => {
      clearInterval(timer);
      stream.close();
    };
    // refresh closes over the current pair via the argument default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair]);

  const asks = useMemo(() => [...(book?.asks ?? [])].reverse(), [book]);
  const maxTotal = useMemo(() => {
    const values = [...(book?.bids ?? []), ...(book?.asks ?? [])].map((level) => Number(level.total.replace(/,/g, "")) || 0);
    return Math.max(1, ...values);
  }, [book]);

  function applyPlain() {
    const parsed = parsePlain(plain);
    if (!parsed) {
      setError("Try: buy 0.0001 BTC at 90k");
      return;
    }
    setPair(parsed.pair);
    setSide(parsed.side);
    setQty(parsed.qty);
    setOrderType(parsed.orderType);
    if (parsed.price) setPrice(parsed.price);
    setError("");
  }

  async function submit(sign: boolean) {
    setBusy(true);
    setError("");
    try {
      if (!account) throw new Error("Choose the demo key or connect a wallet first");
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
          referrer: referrer || undefined,
        }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) throw new Error(preview.error || "Could not review the order");
      setDraft(preview);
      if (!sign) return;
      const body: Record<string, unknown> = { previewId: preview.previewId };
      if (preview.take) body.take = await wallet.signLeg(preview.take);
      if (preview.rest) body.rest = await wallet.signLeg(preview.rest);
      const placed = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await placed.json();
      if (!placed.ok) throw new Error(data.error || "Could not place the order");
      setResult(data);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy(false);
    }
  }

  const fill = (result?.fill ?? null) as { settlement?: string; note?: string; simulate?: unknown; price?: string; baseQty?: string; quoteQty?: string } | null;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {(Object.keys(PAIRS) as PairId[]).map((id) => (
          <button
            key={id}
            onClick={() => {
              setPair(id);
              setQty(PAIRS[id].suggested);
              setPrice("");
            }}
            className={`min-w-28 rounded-lg border px-3 py-2 text-left ${pair === id ? "border-lime bg-panel" : "border-line bg-transparent"}`}
          >
            <span className="block text-sm">{id.replace("-USDC", "")}</span>
            <span className="nums text-xs text-muted">{mids[id] ? `$${mids[id]}` : "..."}</span>
          </button>
        ))}
      </div>

      <PriceCompare pair={pair} side={side} qty={qty} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)_minmax(300px,0.95fr)]">
        <section className="order-2 space-y-4 lg:order-1">
          <div className="rounded-lg border border-line bg-panel p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Reference mid</p>
                <p className="nums font-display text-4xl">{book?.mid ? `$${book.mid}` : "Loading"}</p>
              </div>
              <p className="max-w-48 text-right text-xs text-muted">
                {book?.source ?? "Waiting for 1Click token prices"}
                {book?.rheaMid ? `. Rhea ${book.rheaMid}` : ""}
              </p>
            </div>
            <Chart points={history} />
          </div>
          <div className="rounded-lg border border-line bg-panel p-4">
            <h2 className="text-sm text-muted">Recent matches</h2>
            {trades.length === 0 ? (
              <p className="mt-3 text-sm">No matches yet. A buy at the best ask will cross the maker quotes.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {trades.slice(0, 6).map((trade) => (
                  <li key={String(trade.id)} className="flex items-center justify-between gap-3 text-sm">
                    <span className="nums">
                      {String(trade.baseQty)} {pair.slice(0, pair.indexOf("-"))} @ {String(trade.price)}
                    </span>
                    <Badge value={String(trade.settlement ?? trade.status)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="order-3 rounded-lg border border-line bg-panel p-3 lg:order-2">
          <div className="nums mb-2 grid grid-cols-3 px-2 text-[11px] uppercase tracking-wide text-muted">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Total USDC</span>
          </div>
          {!book ? <p className="px-2 py-8 text-sm text-muted">Loading the book.</p> : null}
          {book && asks.length === 0 && book.bids.length === 0 ? (
            <p className="px-2 py-8 text-sm text-muted">The book is quiet. Reference prices load the maker ladder.</p>
          ) : null}
          <div className="space-y-0.5">
            {asks.map((level) => (
              <LevelRow key={`a-${level.price}`} level={level} tone="ask" max={maxTotal} onPick={setPrice} />
            ))}
          </div>
          <div className="my-2 rounded-md bg-background px-2 py-2 text-center text-xs text-muted">
            Spread {book?.spread ?? "-"} | bid {book?.bestBid ?? "-"} | ask {book?.bestAsk ?? "-"}
          </div>
          <div className="space-y-0.5">
            {(book?.bids ?? []).map((level) => (
              <LevelRow key={`b-${level.price}`} level={level} tone="bid" max={maxTotal} onPick={setPrice} />
            ))}
          </div>
        </section>

        <section className="order-1 rounded-lg border border-line bg-panel p-4 lg:order-3">
          <label className="text-xs uppercase tracking-[0.14em] text-muted" htmlFor="plain">
            Plain language
          </label>
          <div className="mt-2 flex gap-2">
            <Input id="plain" value={plain} placeholder="buy 0.0001 BTC at 90k" onChange={(event) => setPlain(event.target.value)} />
            <Button type="button" variant="outline" onClick={applyPlain}>
              Use
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" variant={side === "BUY" ? "bid" : "outline"} onClick={() => setSide("BUY")}>
              Buy
            </Button>
            <Button type="button" variant={side === "SELL" ? "ask" : "outline"} onClick={() => setSide("SELL")}>
              Sell
            </Button>
          </div>
          <label className="mt-4 block text-xs text-muted" htmlFor="qty">
            Amount ({PAIRS[pair].base})
          </label>
          <Input id="qty" className="mt-1 nums" value={qty} inputMode="decimal" onChange={(event) => setQty(event.target.value)} />
          <div className="mt-4 flex items-center justify-between">
            <label className="text-xs text-muted" htmlFor="price">
              Limit price (USDC)
            </label>
            <button className="text-xs text-lime" type="button" onClick={() => setOrderType(orderType === "MARKET" ? "LIMIT" : "MARKET")}>
              {orderType === "MARKET" ? "Switch to limit" : "Switch to market"}
            </button>
          </div>
          <Input
            id="price"
            className="mt-1 nums"
            disabled={orderType === "MARKET"}
            placeholder={side === "BUY" ? book?.bestAsk ?? "Best ask" : book?.bestBid ?? "Best bid"}
            value={orderType === "MARKET" ? "" : price}
            onChange={(event) => setPrice(event.target.value)}
          />
          <p className="mt-3 text-xs leading-5 text-muted">
            Funds stay in your Intents account. This demo key {account ? shortAccount(account) : ""} signs a token_diff. A resting
            order does not lock the balance. Market size the book cannot take is quoted on 1Click with dry: true.
          </p>
          {error ? <p className="mt-3 text-sm text-ask">{error}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => submit(false)}>
              Review
            </Button>
            <Button type="button" disabled={busy} onClick={() => submit(true)}>
              {busy ? "Signing" : "Sign and place"}
            </Button>
          </div>
          {draft ? (
            <div className="mt-4 space-y-2 text-sm">
              {draft.warnings.map((warning) => (
                <p key={warning} className="text-muted">
                  {warning}
                </p>
              ))}
              {draft.take ? (
                <p>
                  Take {draft.take.baseQty} at {draft.take.price} for {draft.take.quoteQty} USDC. Taker fee {draft.take.fee} USDC. Maker fee 0.
                </p>
              ) : null}
              {draft.rest ? (
                <p>
                  Rest {draft.rest.baseQty} at {draft.rest.price} until {draft.rest.deadline?.slice(11, 19) ?? "the deadline"}.
                </p>
              ) : null}
              {draft.fallbackError ? <p className="text-ask">1Click: {draft.fallbackError}</p> : null}
            </div>
          ) : null}
          {fill ? (
            <div className="mt-4 rounded-md border border-line bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">
                  {fill.baseQty} @ {fill.price}
                </p>
                <Badge value={String(fill.settlement)} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{fill.note}</p>
              <Dialog trigger={<Button className="mt-3" variant="outline" size="sm">Open simulate_intents</Button>} title="simulate_intents">
                <pre className="nums max-h-96 overflow-auto text-xs">{JSON.stringify(fill.simulate, null, 2)}</pre>
              </Dialog>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function LevelRow({
  level,
  tone,
  max,
  onPick,
}: {
  level: Level;
  tone: "bid" | "ask";
  max: number;
  onPick: (price: string) => void;
}) {
  const width = Math.min(100, ((Number(level.total.replace(/,/g, "")) || 0) / max) * 100);
  return (
    <button type="button" onClick={() => onPick(level.price)} className="relative block w-full rounded px-2 py-1 text-left hover:bg-panel-2">
      <span
        className={`absolute inset-y-0 right-0 ${tone === "ask" ? "bg-ask/15" : "bg-bid/15"}`}
        style={{ width: `${width}%` }}
      />
      <span className="nums relative grid grid-cols-3 text-xs">
        <span className={tone === "ask" ? "text-ask" : "text-bid"}>{level.price}</span>
        <span className="text-right">{level.qty}</span>
        <span className="text-right text-muted">{level.total}</span>
      </span>
    </button>
  );
}

function Chart({ points }: { points: Point[] }) {
  if (points.length < 2) {
    return <p className="mt-6 text-sm text-muted">The mid line appears as the server samples 1Click prices.</p>;
  }
  const width = 640;
  const height = 160;
  const pad = 8;
  const values = points.map((point) => point.mid);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((point.mid - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-40 w-full" role="img" aria-label="Reference mid">
      <polyline fill="none" stroke="#d6f25c" strokeWidth="2" points={coords.join(" ")} />
    </svg>
  );
}
