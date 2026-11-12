"use client";

import { BookOpenText, Code2, ListOrdered, Wallet as WalletIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHealth } from "@/components/site/use-market";
import { KIND_LABEL, WalletDialog } from "@/components/site/wallet-dialog";
import { useWallet } from "@/components/wallet";
import { shortAccount } from "@/lib/format";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/", label: "Trade", icon: BookOpenText },
  { href: "/orders", label: "Orders", icon: ListOrdered },
  { href: "/funds", label: "Funds", icon: WalletIcon },
  { href: "/developers", label: "Build", icon: Code2 },
];

function StatusPill({ compact = false }: { compact?: boolean }) {
  const health = useHealth();
  const live = health?.liveExecution === "armed";
  return (
    <span
      title={live ? "Live: matches that pass simulation are broadcast with execute_intents" : "Dry-run: every match is checked with simulate_intents; nothing is broadcast"}
      className={cn(
        "nums inline-flex h-8 items-center gap-2 rounded-sm border px-2.5 text-[0.625rem] uppercase tracking-[0.14em]",
        live ? "border-ask/50 text-ask" : "border-lime/40 text-lime",
      )}
    >
      <span className="animate-pulse-dot size-1.5 rounded-full bg-current" />
      {compact ? (live ? "Live" : "Dry") : live ? "Live on mainnet" : "Dry-run · mainnet sim"}
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const wallet = useWallet();
  const session = wallet.session;
  if (pathname.startsWith("/embed")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4">
        <Link href="/" className="group flex items-baseline gap-2" aria-label="IntentBook home">
          <span className="font-display text-[1.75rem] italic leading-none">IntentBook</span>
          <span className="eyebrow hidden !text-[0.625rem] text-faint lg:inline">No. 01 · NEAR Intents</span>
        </Link>
        <nav className="hidden items-center md:flex" aria-label="Main">
          {NAV.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 items-center px-3 text-sm transition-colors",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {link.label}
                <span className={cn("absolute inset-x-3 bottom-0 h-0.5 bg-lime transition-transform", active ? "scale-x-100" : "scale-x-0")} />
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:inline-flex">
            <StatusPill />
          </span>
          <span className="sm:hidden">
            <StatusPill compact />
          </span>
          <WalletDialog
            trigger={
              <button
                type="button"
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-sm px-3 text-sm transition-colors",
                  session ? "border border-line-strong hover:border-ink/40" : "bg-ink text-background hover:bg-lime",
                )}
              >
                {session ? (
                  <>
                    <span className="eyebrow hidden !text-[0.625rem] text-muted sm:inline">{KIND_LABEL[session.kind]}</span>
                    <span className="nums text-xs">{shortAccount(session.accountId)}</span>
                  </>
                ) : (
                  "Connect"
                )}
              </button>
            }
          />
        </div>
      </div>
    </header>
  );
}

/** Phone navigation: fixed to the bottom with safe-area padding. */
export function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/embed")) return null;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem]", active ? "text-lime" : "text-muted")}
              >
                <Icon className="size-[18px]" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/embed")) return null;
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-8 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-display text-base italic text-ink">IntentBook</span> · a public order book that settles through NEAR Intents.
          Built for the NEAR Hackathon, November 2026.
        </p>
        <p className="nums flex flex-wrap gap-4">
          <a className="hover:text-ink" href="https://github.com/DEVELOPER0fDEFI/Intentbook" target="_blank" rel="noreferrer">
            GitHub ↗︎
          </a>
          <a className="hover:text-ink" href="/openapi.json">
            OpenAPI
          </a>
          <Link className="hover:text-ink" href="/api/v1/health" prefetch={false}>
            Health
          </Link>
          <span>Apache-2.0</span>
        </p>
      </div>
    </footer>
  );
}
