/**
 * IntentBook MCP server: lets an AI agent read the public book and trade on it with its own key.
 *
 * The agent's ed25519 key stays on the machine running this server. Orders are built by the
 * IntentBook API, signed here as NEP-413, and sent back signed. The API never sees the key.
 * Guardrails: a per-order USDC cap and an optional pair allowlist, both set by the human.
 *
 * Run: npx tsx mcp/server.ts   (stdio transport; logs go to stderr)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseSecretKey } from "../lib/keys";
import { bytesToHex, generateKey, signExisting, type DemoKey } from "../lib/nep413";

const PAIRS = ["BTC-USDC", "ETH-USDC", "SOL-USDC", "NEAR-USDC"] as const;
type Pair = (typeof PAIRS)[number];

export interface AgentConfig {
  baseUrl: string;
  key: DemoKey;
  keySource: string;
  maxOrderUsdc: number;
  allowedPairs: readonly Pair[];
}

function loadKey(env: NodeJS.ProcessEnv): { key: DemoKey; source: string } {
  if (env.INTENTBOOK_AGENT_SECRET?.trim()) {
    return { key: parseSecretKey(env.INTENTBOOK_AGENT_SECRET), source: "INTENTBOOK_AGENT_SECRET" };
  }
  const file = env.INTENTBOOK_AGENT_KEY_FILE || path.join(os.homedir(), ".intentbook", "agent-key.json");
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { secretHex?: string };
    if (!saved.secretHex) throw new Error(`${file} has no secretHex`);
    return { key: parseSecretKey(saved.secretHex), source: file };
  }
  const key = generateKey();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ secretHex: bytesToHex(key.secretKey), accountId: key.accountId }), { mode: 0o600 });
  console.error(`Created a new agent key at ${file}. Account ${key.accountId}. Fund it on intents.near before live trading.`);
  return { key, source: file };
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const { key, source } = loadKey(env);
  const allowed = (env.INTENTBOOK_AGENT_PAIRS || PAIRS.join(","))
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is Pair => (PAIRS as readonly string[]).includes(item));
  const cap = Number(env.INTENTBOOK_AGENT_MAX_USDC || "25");
  return {
    baseUrl: (env.INTENTBOOK_URL || "https://intentbook.up.railway.app").replace(/\/$/, ""),
    key,
    keySource: source,
    maxOrderUsdc: Number.isFinite(cap) && cap > 0 ? cap : 25,
    allowedPairs: allowed.length > 0 ? allowed : PAIRS,
  };
}

type Json = Record<string, unknown>;

async function call(config: AgentConfig, method: "GET" | "POST", route: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${config.baseUrl}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) throw new Error(String(data.error || `${method} ${route} failed with ${res.status}`));
  return data;
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] };
}

function sign(config: AgentConfig, leg: { message: string; nonce: string; standard?: string }) {
  if (leg.standard && leg.standard !== "nep413") throw new Error(`Unexpected signing standard ${leg.standard}`);
  return signExisting({ secretKey: config.key.secretKey, message: leg.message, nonceBase64: leg.nonce });
}

/** Rough USDC notional, used only for the agent's own guardrail. */
async function notionalUsdc(config: AgentConfig, pair: Pair, qty: number, price?: number): Promise<number> {
  if (price && price > 0) return qty * price;
  const ticker = (await call(config, "GET", "/api/v1/ticker")) as { pairs?: { pair: string; mid: string | null }[] };
  const mid = Number(ticker.pairs?.find((row) => row.pair === pair)?.mid ?? NaN);
  if (!Number.isFinite(mid)) throw new Error(`No reference price for ${pair}, so the order cap cannot be checked`);
  return qty * mid;
}

export function buildServer(config: AgentConfig): McpServer {
  const server = new McpServer({ name: "intentbook", version: "0.1.0" });
  const account = config.key.accountId;
  const pairSchema = z.enum(PAIRS).describe("Market, quoted in USDC");
  const read = { readOnlyHint: true, openWorldHint: true } as const;

  server.registerTool(
    "intentbook_status",
    {
      title: "IntentBook status",
      description:
        "Shows the agent's NEAR Intents account, its guardrails, and whether the book is in dry-run or live. Call this first.",
      inputSchema: {},
      annotations: read,
    },
    async () => {
      try {
        const health = await call(config, "GET", "/api/v1/health");
        return text({
          agentAccount: account,
          keySource: config.keySource,
          maxOrderUsdc: config.maxOrderUsdc,
          allowedPairs: config.allowedPairs,
          book: config.baseUrl,
          dryRun: health.dryRun,
          liveExecution: health.liveExecution,
          note: health.liveNote,
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_book",
    {
      title: "Order book",
      description: "Bids and asks for one pair with cumulative USDC depth, the reference mid, spread and lot size.",
      inputSchema: { pair: pairSchema },
      annotations: read,
    },
    async ({ pair }) => {
      try {
        return text(await call(config, "GET", `/api/v1/book?pair=${pair}`));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_ticker",
    { title: "Ticker", description: "Reference mid, best bid and best ask for every pair.", inputSchema: {}, annotations: read },
    async () => {
      try {
        const data = (await call(config, "GET", "/api/v1/ticker")) as { pairs?: Json[] };
        // Drop the price history: agents need the current quote, not 90 samples.
        return text(
          (data.pairs ?? []).map((row) => {
            const copy = { ...row };
            delete copy.history;
            return copy;
          }),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "best_price",
    {
      title: "Best venue",
      description: "Total USDC cost or proceeds for a size on the IntentBook book, NEAR Intents 1Click, and (for NEAR) Rhea, and which is best.",
      inputSchema: { pair: pairSchema, side: z.enum(["BUY", "SELL"]), qty: z.string().describe("Base amount, for example 0.1") },
      annotations: read,
    },
    async ({ pair, side, qty }) => {
      try {
        const params = new URLSearchParams({ pair, side, qty, account });
        return text(await call(config, "GET", `/api/v1/quote/best?${params}`));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "place_order",
    {
      title: "Place an order",
      description:
        "Builds the order on IntentBook, signs it locally with the agent's key, and submits it. A crossing order is matched at the makers' prices and settled through NEAR Intents (simulated in dry-run). Leftover size of a limit order rests on the book. Refused above the agent's USDC cap.",
      inputSchema: {
        pair: pairSchema,
        side: z.enum(["BUY", "SELL"]),
        qty: z.string().describe("Base amount, for example 0.1"),
        order_type: z.enum(["LIMIT", "MARKET"]).default("LIMIT"),
        price: z.string().optional().describe("Limit price in USDC per 1 coin. Required for LIMIT."),
        deadline_seconds: z.number().int().min(15).max(86400).optional().describe("How long a resting order lives"),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ pair, side, qty, order_type, price, deadline_seconds }) => {
      try {
        if (!config.allowedPairs.includes(pair)) throw new Error(`${pair} is not in this agent's allowed pairs`);
        if (order_type === "LIMIT" && !price) throw new Error("A LIMIT order needs a price");
        const size = Number(qty);
        if (!Number.isFinite(size) || size <= 0) throw new Error("qty must be a positive number");
        const notional = await notionalUsdc(config, pair, size, price ? Number(price) : undefined);
        if (notional > config.maxOrderUsdc) {
          throw new Error(`Order is about ${notional.toFixed(2)} USDC, above this agent's cap of ${config.maxOrderUsdc} USDC`);
        }
        const preview = (await call(config, "POST", "/api/v1/orders/preview", {
          account,
          pair,
          side,
          orderType: order_type,
          qty,
          price,
          deadlineSeconds: deadline_seconds,
          standard: "nep413",
        })) as { previewId: string; take?: { message: string; nonce: string; standard: string } | null; rest?: { message: string; nonce: string; standard: string } | null; warnings?: string[] };
        const body: Json = { previewId: preview.previewId };
        if (preview.take) body.take = sign(config, preview.take);
        if (preview.rest) body.rest = sign(config, preview.rest);
        const placed = (await call(config, "POST", "/api/v1/orders", body)) as {
          ok?: boolean;
          error?: string;
          orders?: Json[];
          fill?: Json | null;
          liveNote?: string;
        };
        return text({
          ok: placed.ok !== false,
          error: placed.error,
          warnings: preview.warnings,
          restingOrders: (placed.orders ?? []).map((order) => ({ id: order.id, side: order.side, qty: order.qty, price: order.price, status: order.status })),
          fill: placed.fill
            ? {
                price: placed.fill.price,
                baseQty: placed.fill.baseQty,
                quoteQty: placed.fill.quoteQty,
                settlement: placed.fill.settlement,
                takerFee: placed.fill.takerFee,
                txHash: placed.fill.txHash,
                explorer: placed.fill.explorer,
                note: placed.fill.note,
              }
            : null,
          liveNote: placed.liveNote,
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "cancel_order",
    {
      title: "Cancel an order",
      description: "Signs a cancel message for one of the agent's resting orders and removes it from the book.",
      inputSchema: { order_id: z.string().describe("Order id from place_order or my_orders") },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ order_id }) => {
      try {
        const draft = (await call(config, "POST", "/api/v1/orders/cancel-preview", { id: order_id, account, standard: "nep413" })) as {
          message: string;
          nonce: string;
          standard: string;
        };
        const done = await call(config, "POST", "/api/v1/orders/cancel", { signed: sign(config, draft) });
        return text({ cancelled: order_id, order: done.order, onChain: done.onChain });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "my_orders",
    {
      title: "My orders",
      description: "The agent's orders on the book, newest first.",
      inputSchema: { status: z.enum(["OPEN", "FILLED", "CANCELLED", "EXPIRED"]).optional() },
      annotations: read,
    },
    async ({ status }) => {
      try {
        const params = new URLSearchParams({ account });
        if (status) params.set("status", status);
        return text(await call(config, "GET", `/api/v1/orders?${params}`));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "my_balances",
    {
      title: "My balances",
      description: "The agent's balances inside intents.near for USDC and the four base assets, in raw atoms.",
      inputSchema: {},
      annotations: read,
    },
    async () => {
      try {
        return text(await call(config, "GET", `/api/v1/balances?account=${account}`));
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

export async function startStdio(env: NodeJS.ProcessEnv = process.env) {
  const config = configFromEnv(env);
  const server = buildServer(config);
  await server.connect(new StdioServerTransport());
  console.error(`IntentBook MCP ready. Agent ${config.key.accountId} on ${config.baseUrl}`);
}
