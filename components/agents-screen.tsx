"use client";

import { Bot, KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, SectionLabel } from "@/components/ui/panel";

const HOSTED = "https://intentbook.up.railway.app";

const TOOLS: [string, string][] = [
  ["intentbook_status", "The agent's account, its guardrails, dry-run or live"],
  ["get_book · get_ticker", "Depth, mid, spread and lot size"],
  ["best_price", "Book versus 1Click versus Rhea for a size"],
  ["place_order", "Build the order, sign it locally, submit it"],
  ["cancel_order", "Signed cancel of one of the agent's orders"],
  ["my_orders · my_balances", "The agent's orders and intents.near balances"],
];

const STEPS = [
  { title: "The API builds the order", body: "The agent asks for a quote-sized order. IntentBook returns the exact token_diff to sign." },
  { title: "The agent signs it locally", body: "The MCP server holds the agent's ed25519 key and signs NEP-413. The API only ever sees the signature." },
  { title: "intents.near checks it", body: "The order is matched like anyone else's and the batch is simulated on mainnet before anything settles." },
];

export function AgentsScreen() {
  const [origin, setOrigin] = useState(HOSTED);
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="AI agents · MCP"
        title={
          <>
            Give an agent a trading desk, <span className="italic text-lime">not your keys.</span>
          </>
        }
        description="The IntentBook MCP server lets Claude, Codex or any MCP client read the book and trade on it. Each agent gets its own NEAR Intents account and a spending cap the human sets."
        action={
          <Button asChild variant="outline">
            <Link href="/activity">See every fill</Link>
          </Button>
        }
      />

      <ol className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="bg-panel p-5">
            <p className="nums text-xs text-lime">{String(index + 1).padStart(2, "0")}</p>
            <p className="font-display mt-2 text-2xl leading-tight">{step.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 space-y-4">
          <SectionLabel>Add it to Claude Code</SectionLabel>
          <CodeBlock
            label="shell"
            code={`claude mcp add intentbook \\
  -e INTENTBOOK_URL=${origin} \\
  -e INTENTBOOK_AGENT_MAX_USDC=5 \\
  -- npx tsx /path/to/intentbook/mcp/stdio.ts`}
          />
          <SectionLabel>Or any MCP client</SectionLabel>
          <CodeBlock
            label="json"
            code={JSON.stringify(
              {
                mcpServers: {
                  intentbook: {
                    command: "npx",
                    args: ["tsx", "/path/to/intentbook/mcp/stdio.ts"],
                    env: { INTENTBOOK_URL: origin, INTENTBOOK_AGENT_MAX_USDC: "5", INTENTBOOK_AGENT_PAIRS: "NEAR-USDC" },
                  },
                },
              },
              null,
              2,
            )}
          />
          <div className="rounded-[var(--radius-panel)] border border-line bg-panel/90 p-5">
            <p className="eyebrow text-faint">Then ask</p>
            <p className="font-display mt-2 text-2xl leading-snug">
              &ldquo;What is the NEAR spread on IntentBook? Rest a 2 NEAR bid at 1 USDC, then cancel it.&rdquo;
            </p>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel label="Tools" bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {TOOLS.map(([name, what]) => (
                <li key={name} className="px-4 py-3">
                  <p className="nums text-xs text-lime">{name}</p>
                  <p className="mt-0.5 text-xs text-muted">{what}</p>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel label="Guardrails the human sets">
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-lime" />
                <span>
                  <code className="nums text-xs text-ink">INTENTBOOK_AGENT_MAX_USDC</code> caps every order. Default 25.
                </span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-lime" />
                <span>
                  <code className="nums text-xs text-ink">INTENTBOOK_AGENT_PAIRS</code> limits the markets it can touch.
                </span>
              </li>
              <li className="flex gap-3">
                <KeyRound className="mt-0.5 size-4 shrink-0 text-lime" />
                <span>
                  The key lives at <code className="nums text-xs text-ink">~/.intentbook/agent-key.json</code> or{" "}
                  <code className="nums text-xs text-ink">INTENTBOOK_AGENT_SECRET</code>. Fund its account inside intents.near to trade live.
                </span>
              </li>
              <li className="flex gap-3">
                <Bot className="mt-0.5 size-4 shrink-0 text-lime" />
                <span>Every agent order is a token_diff the agent signed, checked by intents.near like a person&apos;s.</span>
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
