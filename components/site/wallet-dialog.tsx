"use client";

import { ArrowUpRight, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useWallet, type WalletKind } from "@/components/wallet";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { nearblocksAccount, shortAccount } from "@/lib/format";
import { cn } from "@/lib/cn";

const OPTIONS: { kind: WalletKind; title: string; mark: string; body: string; tag?: string }[] = [
  {
    kind: "demo",
    title: "Demo key",
    mark: "D",
    body: "No wallet and no funds. An ed25519 key in this browser signs NEP-413. Fills simulate against mainnet.",
    tag: "Best for judging",
  },
  {
    kind: "near",
    title: "NEAR wallet",
    mark: "N",
    body: "Meteor, HOT, MyNearWallet or HERE. Signs NEP-413 with a full-access key of your account.",
  },
  { kind: "evm", title: "MetaMask", mark: "M", body: "Signs ERC-191. Your EVM address is your NEAR Intents account." },
  { kind: "solana", title: "Phantom", mark: "P", body: "Signs raw ed25519. Your Solana key is your NEAR Intents account." },
];

export const KIND_LABEL: Record<WalletKind, string> = { demo: "Demo key", near: "NEAR", evm: "MetaMask", solana: "Phantom" };

export function WalletDialog({ trigger }: { trigger: ReactNode }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<WalletKind | null>(null);
  const session = wallet.session;

  useEffect(() => {
    if (pending && session?.kind === pending && !wallet.busy) {
      setPending(null);
      setOpen(false);
    }
  }, [pending, session, wallet.busy]);

  function connect(kind: WalletKind) {
    setPending(kind);
    if (kind === "demo") wallet.useDemo();
    if (kind === "near") void wallet.connectNear();
    if (kind === "evm") void wallet.connectEvm();
    if (kind === "solana") void wallet.connectSolana();
  }

  const named = session?.kind === "near" && session.accountId.includes(".");
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="Choose a signer"
      description="IntentBook never holds funds or keys. Your signer approves each order as a NEAR Intents token_diff."
    >
      <ul className="space-y-2">
        {OPTIONS.map((option) => {
          const active = session?.kind === option.kind;
          const loading = pending === option.kind && wallet.busy;
          return (
            <li key={option.kind}>
              <button
                type="button"
                onClick={() => connect(option.kind)}
                disabled={wallet.busy}
                className={cn(
                  "group flex min-h-16 w-full items-center gap-4 rounded-sm border px-4 py-3 text-left transition-colors",
                  active ? "border-lime/60 bg-lime/[0.06]" : "border-line hover:border-line-strong hover:bg-panel-2",
                )}
              >
                <span className="font-display grid size-10 shrink-0 place-items-center rounded-full border border-line-strong text-xl italic">{option.mark}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {option.title}
                    {option.tag ? <span className="eyebrow rounded-sm bg-lime px-1.5 !text-[0.625rem] text-background">{option.tag}</span> : null}
                    {active ? <span className="eyebrow !text-[0.625rem] text-lime">Connected</span> : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted">{option.body}</span>
                </span>
                {loading ? <Loader2 className="size-4 animate-spin text-muted" /> : <ArrowUpRight className="size-4 text-faint transition-colors group-hover:text-ink" />}
              </button>
            </li>
          );
        })}
      </ul>
      {wallet.error ? <p className="mt-3 text-sm text-ask">{wallet.error}</p> : null}
      {session ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <a href={nearblocksAccount(session.accountId)} target="_blank" rel="noreferrer" className="nums text-xs text-muted hover:text-ink">
            {KIND_LABEL[session.kind]} · {shortAccount(session.accountId)} ↗︎
          </a>
          {named ? (
            <Button size="sm" variant="outline" disabled={wallet.busy} onClick={() => void wallet.registerNearKey()}>
              <KeyRound className="size-3.5" /> Register key on intents.near
            </Button>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
