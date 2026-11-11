"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { nearblocksAccount, shortAccount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useWallet } from "@/components/wallet";

const links = [
  { href: "/", label: "Trade" },
  { href: "/orders", label: "Orders" },
  { href: "/funds", label: "Funds" },
  { href: "/developers", label: "API" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const wallet = useWallet();
  const [fee, setFee] = useState<string>("");
  const [takerFee, setTakerFee] = useState("");
  const [salt, setSalt] = useState("");
  const [live, setLive] = useState("off");
  const account = wallet.session?.accountId ?? "";

  useEffect(() => {
    fetch("/api/v1/health")
      .then((res) => res.json())
      .then((data) => {
        if (data.feePips != null) setFee(String(data.feePips));
        if (data.takerFeeBps != null) setTakerFee(String(data.takerFeeBps));
        if (data.salt) setSalt(data.salt);
        if (data.liveExecution) setLive(String(data.liveExecution));
      })
      .catch(() => undefined);
  }, []);

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <Link href="/" className="mr-2">
          <span className="font-display text-2xl italic tracking-tight">IntentBook</span>
          <span className="mt-0.5 block text-[11px] uppercase tracking-[0.16em] text-muted">Public book for NEAR Intents</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm",
                  active ? "bg-panel-2 text-ink" : "text-muted hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-lime px-2.5 py-1 text-[11px] font-medium text-background">{live === "off" ? "DRY-RUN" : `LIVE ${live}`}</span>
          <button type="button" className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => void wallet.connectNear()} disabled={wallet.busy}>
            NEAR wallet
          </button>
          <button type="button" className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => void wallet.connectEvm()} disabled={wallet.busy}>
            MetaMask
          </button>
          <button type="button" className="rounded-md border border-line px-2 py-1 text-xs" onClick={() => wallet.useDemo()}>
            Demo key
          </button>
          {account ? (
            <a className="nums text-xs text-muted hover:text-ink" href={nearblocksAccount(account)}>
              {wallet.session?.kind ?? "demo"} {shortAccount(account)}
            </a>
          ) : (
            <span className="text-xs text-muted">Preparing demo key</span>
          )}
        </div>
      </div>
      <div className="border-t border-line/70 bg-panel/60">
        <p className="mx-auto max-w-7xl px-4 py-2 text-xs text-muted">
          {live === "off" ? "Dry-run is on. execute_intents is not called." : "Live mode is armed. A failed simulation is refused."}{" "}
          Sign with a NEAR wallet, MetaMask, or the demo key.
          {takerFee ? ` Taker fee ${takerFee} bps. Maker fee 0.` : ""}
          {fee ? ` Protocol fee ${fee} pip.` : ""}
          {salt ? ` Salt ${salt}.` : ""}
          {wallet.error ? ` ${wallet.error}` : ""}
        </p>
      </div>
    </header>
  );
}
