import { ArrowDown, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Seal } from "@/components/site/seal";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/panel";

const STEPS = [
  { n: "01", title: "Sign", body: "Your wallet signs a token_diff at your price. That signature is the order." },
  { n: "02", title: "Match", body: "Crossing orders pair at the makers' prices, so you keep any improvement." },
  { n: "03", title: "Settle", body: "intents.near checks every signature and balance in one batch, or nothing moves." },
];

const STATS = [
  { value: "4", label: "markets vs USDC" },
  { value: "0", label: "bps maker fee" },
  { value: "8", label: "bps taker fee" },
  { value: "0", label: "funds in custody" },
];

export function Hero() {
  return (
    <section className="relative grid gap-10 border-b border-line pb-12 pt-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:gap-16 lg:pb-16 lg:pt-10">
      <div className="animate-rise">
        <SectionLabel tone="lime">Public limit order book · NEAR Intents</SectionLabel>
        <h1 className="font-display mt-5 text-[clamp(3.1rem,8.4vw,7.4rem)] leading-[0.9] tracking-[-0.02em]">
          Limit orders
          <br />
          in the open.
          <br />
          <span className="italic text-lime">Settled by signature.</span>
        </h1>
        <p className="mt-7 max-w-xl text-base leading-7 text-muted">
          IntentBook shows live depth for BTC, ETH, SOL and NEAR against USDC. Every order is a NEAR Intents{" "}
          <code className="nums rounded-sm bg-panel-2 px-1 text-[0.85em] text-ink">token_diff</code> your wallet signs at your price. Nobody holds
          your funds, and nobody can change the price you signed.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="cream">
            <a href="#terminal">
              Open the book <ArrowDown className="size-4" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/developers#agents">
              Let an AI agent trade <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
        <dl className="mt-10 grid max-w-xl grid-cols-2 border-l border-t border-line sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col border-b border-r border-line px-4 py-3">
              <dt className="eyebrow order-2 !text-[0.625rem] text-muted">{stat.label}</dt>
              <dd className="font-display text-4xl leading-none">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="animate-rise flex flex-col gap-8 [animation-delay:120ms]">
        <Seal className="mx-auto hidden w-[min(300px,70%)] sm:block lg:w-full lg:max-w-[300px]" />
        <ol className="border-t border-line">
          {STEPS.map((step) => (
            <li key={step.n} className="grid grid-cols-[3rem_1fr] gap-3 border-b border-line py-4">
              <span className="nums pt-1 text-xs text-lime">{step.n}</span>
              <div>
                <p className="font-display text-2xl leading-none">{step.title}</p>
                <p className="mt-1.5 text-sm leading-6 text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
