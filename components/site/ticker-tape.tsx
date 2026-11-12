"use client";

import { usePathname } from "next/navigation";
import { changePct, useHealth, useTicker } from "@/components/site/use-market";
import { cn } from "@/lib/cn";

/** Exchange-style tape across the top of every page. Duplicated once for a seamless loop. */
export function TickerTape() {
  const pathname = usePathname();
  const rows = useTicker();
  const health = useHealth();
  const items: { key: string; label: string; value: string; tone?: "up" | "down" | "flat" | "lime" }[] = [
    ...rows.map((row) => {
      const pct = changePct(row.history);
      return {
        key: row.pair,
        label: row.pair.replace("-", "/"),
        // Under 0.005% rounds to 0.00%, so it shows no arrow.
        value: `${row.mid ?? "…"}${pct === null || Math.abs(pct) < 0.005 ? "" : ` ${pct > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(2)}%`}`,
        tone: (pct === null || Math.abs(pct) < 0.005 ? "flat" : pct > 0 ? "up" : "down") as "up" | "down" | "flat",
      };
    }),
    { key: "maker", label: "Maker fee", value: `${health?.makerFeeBps ?? 0} bps` },
    { key: "taker", label: "Taker fee", value: `${health?.takerFeeBps ?? 8} bps`, tone: "lime" as const },
    { key: "settle", label: "Settles on", value: "intents.near" },
    { key: "custody", label: "Custody", value: "none" },
    { key: "mode", label: "Mode", value: health?.liveExecution === "armed" ? "live" : "dry-run" },
  ];
  const tones = { up: "text-bid", down: "text-ask", flat: "text-ink", lime: "text-lime" } as const;
  if (pathname.startsWith("/embed")) return null;
  return (
    <div className="relative overflow-hidden border-b border-line bg-background/90" aria-label="Market ticker">
      <div className="animate-marquee flex w-max">
        {[0, 1].map((copy) => (
          <ul key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
            {items.map((item) => (
              <li key={`${copy}-${item.key}`} className="nums flex items-center gap-2 border-r border-line px-5 py-1.5 text-[0.6875rem] whitespace-nowrap">
                <span className="text-faint uppercase tracking-[0.12em]">{item.label}</span>
                <span className={cn(tones[item.tone ?? "flat"])}>{item.value}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
