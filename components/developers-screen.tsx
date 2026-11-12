"use client";

import { Bot, Code2, Radio, ShieldCheck, SquareStack } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CodeBlock } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, SectionLabel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

const HOSTED = "https://intentbook.up.railway.app";

const READS: [string, string][] = [
  ["/api/v1/book?pair=BTC-USDC", "Bids, asks, mid, spread, lot"],
  ["/api/v1/trades?pair=BTC-USDC", "Matches with their simulate_intents result"],
  ["/api/v1/ticker", "Mids and samples for every pair"],
  ["/api/v1/depth?pair=BTC-USDC&group=1", "Grouped depth"],
  ["/api/v1/candles?pair=BTC-USDC&interval=1m", "1m, 5m, 1h, 1d candles"],
  ["/api/v1/compare?pair=BTC-USDC&side=BUY&qty=0.0001", "Book price versus 1Click"],
  ["/api/v1/quote/best?pair=NEAR-USDC&side=BUY&qty=2", "Best of book, 1Click and Rhea"],
  ["/api/v1/orders?account=", "Orders for one account"],
  ["/api/v1/accounts/{account}", "Orders, fills and balances"],
  ["/api/v1/referrers?id=", "A referrer's share of taker fees"],
  ["/api/v1/status?depositAddress=", "1Click deposit status"],
  ["/api/v1/health", "Fee, salt, mode, key sources"],
];

const WRITES: [string, string][] = [
  ["/api/v1/orders/preview", "Unsigned order legs to sign"],
  ["/api/v1/orders", "Signed legs: match, simulate, rest"],
  ["/api/v1/orders/cancel-preview", "Cancel message for the owner"],
  ["/api/v1/orders/cancel", "Signed cancel only"],
  ["/api/v1/orders/burn-preview", "Empty intent with the order nonce"],
  ["/api/v1/orders/burn", "Signed nonce burn, then the live gate"],
  ["/api/v1/withdraw/preview", "Unsigned ft_withdraw"],
  ["/api/v1/withdraw", "One signed ft_withdraw, then the live gate"],
  ["/api/v1/webhooks/preview", "Registration message to sign"],
  ["/api/v1/webhooks", "Signed HMAC fill webhook"],
  ["/api/v1/deposit-quote", "1Click quote, dry by default"],
  ["/api/v1/near-deposit", "Unsigned ft_transfer_call template"],
];

const TOOLS: [string, string][] = [
  ["intentbook_status", "agent account, guardrails, dry-run or live"],
  ["get_book · get_ticker", "depth, mid, spread, lot"],
  ["best_price", "book vs 1Click vs Rhea for a size"],
  ["place_order", "build, sign locally, submit"],
  ["cancel_order", "signed cancel of the agent's order"],
  ["my_orders · my_balances", "the agent's book state and funds"],
];

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-panel/90 p-5">
      <div className="grid size-10 place-items-center rounded-full border border-line-strong text-lime">{icon}</div>
      <p className="font-display mt-4 text-2xl leading-none">{title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{children}</p>
    </div>
  );
}

function RouteTable({ title, method, rows }: { title: string; method: "GET" | "POST"; rows: [string, string][] }) {
  return (
    <Panel label={title} bodyClassName="p-0">
      <ul className="divide-y divide-line">
        {rows.map(([path, what]) => (
          <li key={path} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,0.8fr)] sm:items-center sm:gap-3">
            <span className={cn("nums w-fit rounded-sm border px-1.5 text-[0.625rem]", method === "GET" ? "border-bid/40 text-bid" : "border-lime/40 text-lime")}>{method}</span>
            <code className="nums break-all text-xs">{path}</code>
            <span className="text-xs text-muted">{what}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function DevelopersScreen() {
  const [origin, setOrigin] = useState(HOSTED);
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Build on the book"
        title={
          <>
            One book. <span className="italic text-lime">Every app.</span>
          </>
        }
        description="Wallets, apps and AI agents share the same public book. Reads need no key. Every write that acts for an account is a signature the server checks, and settlement is a NEAR Intents batch, never a custodial transfer."
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Feature icon={<Code2 className="size-4" />} title="REST + OpenAPI">
          Versioned under /api/v1 with CORS open for reads. The machine-readable spec is at /openapi.json and a small TypeScript client lives in
          packages/sdk.
        </Feature>
        <Feature icon={<Radio className="size-4" />} title="Live streams">
          Server-sent events at /api/v1/stream and a WebSocket at /api/v1/ws on the same port. Fills also go out as HMAC-signed webhooks with
          retries.
        </Feature>
        <Feature icon={<SquareStack className="size-4" />} title="Embed and earn">
          Drop one script tag into any site. The embedding app&apos;s referrer id is stored with each fill and earns half of the taker fee.
        </Feature>
      </div>

      <section id="agents" className="scroll-mt-24 grid gap-6 rounded-[var(--radius-panel)] border border-lime/30 bg-lime/[0.03] p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:p-8">
        <div>
          <SectionLabel tone="lime">AI agents · MCP</SectionLabel>
          <h2 className="font-display mt-2 text-4xl leading-[1.05] sm:text-5xl">
            Give an agent a trading desk, <span className="italic">not your keys.</span>
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted">
            The IntentBook MCP server lets Claude, Codex or any MCP client read the book and trade on it. The agent gets its own NEAR Intents
            account. Its key stays on the machine running the server: the API builds each order, the server signs it locally, and the API only sees
            the signature.
          </p>
          <ul className="mt-5 space-y-2 text-sm">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-lime" />
              <span>
                <span className="nums text-xs text-ink">INTENTBOOK_AGENT_MAX_USDC</span> caps each order. Default 25.
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-lime" />
              <span>
                <span className="nums text-xs text-ink">INTENTBOOK_AGENT_PAIRS</span> limits the markets it can touch.
              </span>
            </li>
            <li className="flex gap-3">
              <Bot className="mt-0.5 size-4 shrink-0 text-lime" />
              <span>Every agent order is a token_diff the agent signed, checked by intents.near like anyone else&apos;s.</span>
            </li>
          </ul>
        </div>
        <div className="min-w-0 space-y-3">
          <CodeBlock
            label="Claude Code"
            code={`claude mcp add intentbook \\
  -e INTENTBOOK_URL=${origin} \\
  -e INTENTBOOK_AGENT_MAX_USDC=5 \\
  -- npx tsx /path/to/intentbook/mcp/stdio.ts`}
          />
          <div className="rounded-[var(--radius-panel)] border border-line bg-background/70 p-4">
            <p className="eyebrow text-faint">Then ask</p>
            <p className="font-display mt-2 text-2xl leading-snug">
              &ldquo;What is the NEAR spread on IntentBook? Rest a 2 NEAR bid at 1 USDC, then cancel it.&rdquo;
            </p>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-2">
            {TOOLS.map(([name, what]) => (
              <li key={name} className="bg-panel px-3 py-2.5">
                <p className="nums text-xs text-lime">{name}</p>
                <p className="mt-0.5 text-[0.6875rem] text-muted">{what}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <SectionLabel>Quickstart</SectionLabel>
          <CodeBlock
            code={`curl ${origin}/api/v1/book?pair=BTC-USDC
curl ${origin}/api/v1/trades?pair=BTC-USDC
curl "${origin}/api/v1/quote/best?pair=NEAR-USDC&side=BUY&qty=2"
curl ${origin}/openapi.json`}
          />
        </div>
        <div className="min-w-0 space-y-3">
          <SectionLabel>Embed</SectionLabel>
          <CodeBlock label="html" code={`<script src="${origin}/widget.js"\n  data-referrer="your-app"\n  data-origin="${origin}"></script>`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RouteTable title="Reads · no key" method="GET" rows={READS} />
        <RouteTable title="Writes · signed" method="POST" rows={WRITES} />
      </div>
    </div>
  );
}
