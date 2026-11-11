import { accountSummary, balances, bestQuote, book, boot, burnPreview, burnSubmit, candles, cancel, commit, depth, EngineError, health, keyStatus, nearDepositTemplate, orders, preview, priceCompare, quoteDeposit, quoteFallback, referrerStats, registerWebhook, signedCancel, subscribe, ticker, trackDeposit, trades, withdrawPreview, withdrawSubmit } from "@/lib/engine";
import { json, options, run } from "@/lib/http";
import type { Side, SignedIntent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function OPTIONS() {
  return options();
}

async function pathOf(ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  return path.join("/");
}

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const name = await pathOf(ctx);
  if (name === "stream") return eventStream(req);
  const url = new URL(req.url);
  return run(async () => {
    if (name === "health") return health();
    if (name === "ticker") return ticker();
    if (name === "book") return book(url.searchParams.get("pair") || "BTC-USDC");
    if (name === "trades") return trades(url.searchParams.get("pair") || undefined);
    if (name === "orders") {
      return orders({
        account: url.searchParams.get("account") || undefined,
        pair: url.searchParams.get("pair") || undefined,
        status: url.searchParams.get("status") || undefined,
      });
    }
    if (name === "balances") return balances(url.searchParams.get("account") || "");
    if (name === "status") return trackDeposit(url.searchParams.get("depositAddress") || "");
    if (name === "compare") {
      return priceCompare({
        pair: url.searchParams.get("pair") || "BTC-USDC",
        side: url.searchParams.get("side") === "SELL" ? "SELL" : "BUY",
        qty: url.searchParams.get("qty") || "0.0001",
        account: url.searchParams.get("account") || undefined,
      });
    }
    if (name === "quote/best") {
      return bestQuote({
        pair: url.searchParams.get("pair") || "BTC-USDC",
        side: url.searchParams.get("side") === "SELL" ? "SELL" : "BUY",
        qty: url.searchParams.get("qty") || "0.0001",
        account: url.searchParams.get("account") || undefined,
      });
    }
    if (name === "candles") return candles(url.searchParams.get("pair") || "BTC-USDC", url.searchParams.get("interval") || "1m");
    if (name === "depth") return depth(url.searchParams.get("pair") || "BTC-USDC", url.searchParams.get("group") || "1");
    if (name.startsWith("accounts/")) return accountSummary(decodeURIComponent(name.slice("accounts/".length)));
    if (name === "referrers") return referrerStats(url.searchParams.get("id") || "");
    if (name === "keys") return keyStatus(url.searchParams.get("account") || "", url.searchParams.get("publicKey") || "");
    throw new EngineError(404, "Unknown API path");
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const name = await pathOf(ctx);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return json({ error: "JSON body required" }, 400);
  return run(async () => {
    if (name === "orders/preview") {
      return preview({
        account: String(body.account ?? ""),
        pair: String(body.pair ?? ""),
        side: body.side === "SELL" ? "SELL" : "BUY",
        orderType: body.orderType === "MARKET" ? "MARKET" : "LIMIT",
        qty: String(body.qty ?? ""),
        price: body.price == null ? undefined : String(body.price),
        deadlineSeconds: body.deadlineSeconds == null ? undefined : Number(body.deadlineSeconds),
        referrer: body.referrer == null ? undefined : String(body.referrer),
      });
    }
    if (name === "orders") {
      return commit({
        previewId: String(body.previewId ?? ""),
        take: (body.take as SignedIntent | null | undefined) ?? null,
        rest: (body.rest as SignedIntent | null | undefined) ?? null,
      });
    }
    if (name === "orders/cancel") {
      if (body.signed) return signedCancel({ signed: body.signed as SignedIntent });
      return cancel({ id: String(body.id ?? ""), account: String(body.account ?? "") });
    }
    if (name === "webhooks") {
      return registerWebhook({
        account: String(body.account ?? ""),
        url: String(body.url ?? ""),
        signed: body.signed as SignedIntent,
      });
    }
    if (name === "deposit-quote") {
      return quoteDeposit({
        amount: String(body.amount ?? ""),
        account: String(body.account ?? ""),
        refundTo: String(body.refundTo ?? ""),
        dry: body.dry === false ? false : true,
        originAsset: body.originAsset == null ? undefined : String(body.originAsset),
      });
    }
    if (name === "near-deposit") {
      return nearDepositTemplate({
        tokenContract: String(body.tokenContract ?? "wrap.near"),
        amount: String(body.amount ?? ""),
        owner: body.owner == null ? undefined : String(body.owner),
      });
    }
    if (name === "withdraw/preview") {
      return withdrawPreview({
        account: String(body.account ?? ""),
        tokenId: String(body.tokenId ?? ""),
        receiverId: String(body.receiverId ?? ""),
        amount: String(body.amount ?? ""),
        chain: body.chain === "other" ? "other" : "near",
        destinationAsset: body.destinationAsset == null ? undefined : String(body.destinationAsset),
        dry: body.dry === false ? false : true,
      });
    }
    if (name === "withdraw") {
      return withdrawSubmit({ account: String(body.account ?? ""), signed: body.signed as SignedIntent });
    }
    if (name === "orders/burn-preview") {
      return burnPreview({ id: String(body.id ?? ""), account: String(body.account ?? "") });
    }
    if (name === "orders/burn") {
      return burnSubmit({
        id: String(body.id ?? ""),
        account: String(body.account ?? ""),
        signed: body.signed as SignedIntent,
      });
    }
    if (name === "quote") {
      const side: Side = body.side === "SELL" ? "SELL" : "BUY";
      return quoteFallback({
        pair: String(body.pair ?? ""),
        side,
        qty: String(body.qty ?? ""),
        account: String(body.account ?? ""),
      });
    }
    throw new EngineError(404, "Unknown API path");
  });
}

async function eventStream(req: Request) {
  await boot();
  const pair = new URL(req.url).searchParams.get("pair");
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: { type?: string; pair?: string; ts?: number; trade?: unknown }) => {
        if (pair && event.pair && event.pair !== pair) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      send({ type: "hello", ts: Date.now() });
      unsubscribe = subscribe(send);
      timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          if (timer) clearInterval(timer);
        }
      }, 15000);
    },
    cancel() {
      unsubscribe();
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    },
  });
}
