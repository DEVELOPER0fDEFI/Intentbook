"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { Flame, Inbox, Receipt, Timer, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/wallet";
import { AssetMark } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { shortAccount } from "@/lib/format";
import { cn } from "@/lib/cn";

interface OrderRow {
  id: string;
  pair: string;
  side: string;
  price: string;
  qty: string;
  status: string;
  deadline: string;
  owner: string;
  role: string;
}

interface FillRow {
  id: string;
  pair: string;
  price: string;
  baseQty: string;
  quoteQty: string;
  status: string;
  settlement: string;
  note: string;
  simulate: unknown;
  takerAccount: string;
  makerAccounts: string[];
  createdAt: string;
  explorer?: string;
}

function untilLabel(deadline: string): string {
  const ms = Date.parse(deadline) - Date.now();
  if (ms <= 0) return "expired";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)}s left`;
  if (minutes < 90) return `${minutes}m left`;
  return `${Math.round(minutes / 60)}h left`;
}

export function OrdersScreen() {
  const wallet = useWallet();
  const account = wallet.session?.accountId ?? "";
  const [notice, setNotice] = useState("");
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [fills, setFills] = useState<FillRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load(id = account) {
    if (!id) return;
    const [orderRes, tradeRes] = await Promise.all([fetch(`/api/v1/orders?account=${id}`), fetch("/api/v1/trades")]);
    if (orderRes.ok) setOrders((await orderRes.json()).orders ?? []);
    if (tradeRes.ok) {
      const trades = ((await tradeRes.json()).trades ?? []) as FillRow[];
      setFills(trades.filter((trade) => trade.takerAccount === id || trade.makerAccounts?.includes(id)));
    }
  }

  useEffect(() => {
    if (!account) return;
    load(account).catch(() => setError("Could not load orders."));
    const timer = setInterval(() => load(account).catch(() => undefined), 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  async function post(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function cancel(id: string) {
    setError("");
    setBusy(id);
    try {
      const draft = await post("/api/v1/orders/cancel-preview", { id, account, standard: wallet.standard });
      const signed = await wallet.signLeg(draft);
      const data = await post("/api/v1/orders/cancel", { signed });
      setNotice(`Cancelled with your signature. ${String(data.onChain || "")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(null);
      await load();
    }
  }

  async function burn(id: string) {
    setError("");
    setBusy(id);
    try {
      const draft = await post("/api/v1/orders/burn-preview", { id, account, standard: wallet.standard });
      const signed = await wallet.signLeg(draft);
      const data = await post("/api/v1/orders/burn", { id, account, signed });
      setNotice(
        data.broadcast
          ? `Nonce burned on intents.near: ${data.explorer}`
          : `Nonce burn signed and simulated (${data.verdict}). ${data.note || ""}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nonce burn failed");
    } finally {
      setBusy(null);
    }
  }

  async function placeExpiring() {
    setBusy("rest");
    setError("");
    try {
      if (!account) throw new Error("Choose a signer first");
      const preview = await post("/api/v1/orders/preview", {
        account,
        pair: "BTC-USDC",
        side: "BUY",
        orderType: "LIMIT",
        qty: "0.0001",
        price: "1",
        deadlineSeconds: 20,
        standard: wallet.standard,
      });
      const body: Record<string, unknown> = { previewId: preview.previewId };
      if (preview.rest) body.rest = await wallet.signLeg(preview.rest);
      await post("/api/v1/orders", body);
      setNotice("A 20-second bid is resting. Watch it turn EXPIRED.");
      await load(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place the order");
    } finally {
      setBusy(null);
    }
  }

  const open = orders?.filter((order) => order.status === "OPEN").length ?? 0;
  const stats = [
    { label: "Open", value: orders ? String(open) : "–" },
    { label: "All orders", value: orders ? String(orders.length) : "–" },
    { label: "Fills", value: fills ? String(fills.length) : "–" },
    { label: "Signer", value: wallet.session ? shortAccount(account) : "none", mono: true },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your orders"
        title={
          <>
            Every order is a <span className="italic text-lime">signature.</span>
          </>
        }
        description="Cancel signs a cancel message and removes the order here. Nonce burn signs an empty intent with the order's nonce, which is how a nonce is spent on intents.near."
        action={
          <Button variant="outline" disabled={busy !== null} onClick={() => void placeExpiring()}>
            <Timer className="size-4" /> {busy === "rest" ? "Signing…" : "Rest a 20-second bid"}
          </Button>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-panel px-4 py-3">
            <dt className="eyebrow !text-[0.625rem] text-muted">{stat.label}</dt>
            <dd className={cn("mt-1 leading-none", stat.mono ? "nums pt-2 text-sm" : "font-display text-4xl")}>{stat.value}</dd>
          </div>
        ))}
      </dl>

      {error ? (
        <p role="alert" className="rounded-sm border border-ask/40 bg-ask/[0.07] px-3 py-2 text-sm text-ask">
          {error}
        </p>
      ) : null}
      {notice ? <p className="rounded-sm border border-line bg-panel px-3 py-2 text-sm text-muted">{notice}</p> : null}

      <Tabs.Root defaultValue="orders">
        <Tabs.List className="flex gap-6 border-b border-line" aria-label="Orders and fills">
          {[
            { value: "orders", label: "Orders" },
            { value: "fills", label: "Fills" },
          ].map((tab) => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className="relative -mb-px min-h-11 text-sm text-muted data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-lime"
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="orders" className="mt-4">
          {orders === null ? (
            <Skeleton lines={4} />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-4" />}
              title="No orders for this signer"
              body="Place a limit order below the best bid and it rests here until it fills, expires or you cancel it."
              action={
                <Button asChild variant="cream" size="sm">
                  <Link href="/#terminal">Open the book</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line bg-panel/90">
              {orders.map((order) => {
                const symbol = order.pair.split("-")[0]!;
                return (
                  <li key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                    <AssetMark symbol={symbol} />
                    <div className="min-w-0 flex-1">
                      <p className="nums text-sm">
                        <span className={order.side === "BUY" ? "text-bid" : "text-ask"}>{order.side}</span> {order.qty} {symbol}{" "}
                        <span className="text-faint">@</span> {order.price}
                      </p>
                      <p className="nums mt-0.5 text-[0.6875rem] text-muted">
                        {order.status === "OPEN" ? untilLabel(order.deadline) : order.deadline.slice(0, 16).replace("T", " ")} · {order.id.slice(0, 8)}
                      </p>
                    </div>
                    <Badge value={order.status} />
                    <div className="flex gap-2">
                      {order.status === "OPEN" ? (
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void cancel(order.id)}>
                          <X className="size-3.5" /> {busy === order.id ? "Signing…" : "Cancel"}
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void burn(order.id)} title="Sign an empty intent that spends this order's nonce">
                        <Flame className="size-3.5" /> Burn nonce
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Tabs.Content>

        <Tabs.Content value="fills" className="mt-4">
          {fills === null ? (
            <Skeleton lines={4} />
          ) : fills.length === 0 ? (
            <EmptyState
              icon={<Receipt className="size-4" />}
              title="No fills yet"
              body="A buy at the best ask crosses the maker ladder. The match is checked against mainnet with simulate_intents."
              action={
                <Button asChild variant="cream" size="sm">
                  <Link href="/#terminal">Trade</Link>
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {fills.map((fill) => {
                const symbol = fill.pair.split("-")[0]!;
                return (
                  <li key={fill.id} className="rounded-[var(--radius-panel)] border border-line bg-panel/90 p-4">
                    <div className="flex items-center gap-3">
                      <AssetMark symbol={symbol} />
                      <p className="nums flex-1 text-sm">
                        {fill.baseQty} {symbol} <span className="text-faint">@</span> {fill.price}
                        <span className="block text-[0.6875rem] text-muted">
                          {fill.quoteQty} USDC · {fill.createdAt.slice(0, 19).replace("T", " ")}
                        </span>
                      </p>
                      <Badge value={fill.settlement || fill.status} />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted">{fill.note}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Dialog title="simulate_intents" description="The raw mainnet view-call result for this batch." trigger={<Button size="sm" variant="outline">Raw result</Button>}>
                        <pre className="nums max-h-[60vh] overflow-auto rounded-sm bg-background p-3 text-xs leading-5">{JSON.stringify(fill.simulate, null, 2)}</pre>
                      </Dialog>
                      {fill.explorer ? (
                        <Button asChild size="sm" variant="ghost">
                          <a href={fill.explorer} target="_blank" rel="noreferrer">
                            NearBlocks ↗︎
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
