"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useState } from "react";
import { useWallet } from "@/components/wallet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortAccount } from "@/lib/format";

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
}

export function OrdersScreen() {
  const wallet = useWallet();
  const account = wallet.session?.accountId ?? "";
  const [cancelNote, setCancelNote] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [fills, setFills] = useState<FillRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(id = account) {
    if (!id) return;
    const [orderRes, tradeRes] = await Promise.all([
      fetch(`/api/v1/orders?account=${id}`),
      fetch("/api/v1/trades"),
    ]);
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

  async function cancel(id: string) {
    setError("");
    const res = await fetch("/api/v1/orders/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, account }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || "Cancel failed");
    else setCancelNote(String(data.onChain || ""));
    await load();
  }

  async function placeExpiring() {
    setBusy(true);
    setError("");
    try {
      if (!account) throw new Error("Choose a wallet first");
      const previewRes = await fetch("/api/v1/orders/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account,
          pair: "BTC-USDC",
          side: "BUY",
          orderType: "LIMIT",
          qty: "0.0001",
          price: "1",
          deadlineSeconds: 20,
        }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) throw new Error(preview.error || "Could not stage the order");
      const body: Record<string, unknown> = { previewId: preview.previewId };
      if (preview.rest) body.rest = await wallet.signLeg(preview.rest);
      const placed = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await placed.json();
      if (!placed.ok) throw new Error(data.error || "Could not place the order");
      await load(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not place the order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Your orders</h1>
          <p className="mt-1 text-sm text-muted">Demo key {account ? shortAccount(account) : ""}. Cancel is off-book only. The nonce stays unused.</p>
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={placeExpiring}>
          {busy ? "Signing" : "Rest a 20-second bid"}
        </Button>
      </div>
      {error ? <p className="text-sm text-ask">{error}</p> : null}
      {cancelNote ? <p className="text-sm text-muted">{cancelNote}</p> : null}
      <Tabs.Root defaultValue="open">
        <Tabs.List className="flex gap-2">
          <Tabs.Trigger className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-panel" value="open">
            Orders
          </Tabs.Trigger>
          <Tabs.Trigger className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-panel" value="fills">
            Fills
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="open" className="mt-4 space-y-2">
          {orders.length === 0 ? <p className="text-sm text-muted">No orders for this key yet.</p> : null}
          {orders.map((order) => (
            <article key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3">
              <div>
                <p className="text-sm">
                  {order.side} {order.qty} {order.pair} @ {order.price}
                </p>
                <p className="text-xs text-muted">Until {order.deadline}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge value={order.status} />
                {order.status === "OPEN" ? (
                  <Button size="sm" variant="outline" onClick={() => cancel(order.id)}>
                    Cancel
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const res = await fetch("/api/v1/orders/burn-preview", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ id: order.id, account }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setError(data.error || "Could not prepare the nonce burn");
                      return;
                    }
                    setCancelNote(String(data.note || ""));
                  }}
                >
                  Nonce burn
                </Button>
              </div>
            </article>
          ))}
        </Tabs.Content>
        <Tabs.Content value="fills" className="mt-4 space-y-2">
          {fills.length === 0 ? <p className="text-sm text-muted">No fills for this key yet.</p> : null}
          {fills.map((fill) => (
            <article key={fill.id} className="rounded-lg border border-line bg-panel px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  {fill.baseQty} {fill.pair} @ {fill.price} for {fill.quoteQty} USDC
                </p>
                <Badge value={fill.settlement || fill.status} />
              </div>
              <p className="mt-2 text-xs leading-5 text-muted">{fill.note}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-lime">simulate_intents</summary>
                <pre className="nums mt-2 max-h-64 overflow-auto text-xs">{JSON.stringify(fill.simulate, null, 2)}</pre>
              </details>
            </article>
          ))}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
