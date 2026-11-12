"use client";

import { KeyRound, Wallet } from "lucide-react";
import { WalletDialog } from "@/components/site/wallet-dialog";
import { useWallet } from "@/components/wallet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

/** The two ways in: a one-click demo key, or a real wallet. */
export function ConnectButtons({ size = "default" }: { size?: "default" | "sm" }) {
  const wallet = useWallet();
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button size={size} variant="cream" onClick={() => wallet.selectDemo()}>
        <KeyRound className="size-4" /> Use demo key
      </Button>
      <WalletDialog
        trigger={
          <Button size={size} variant="outline">
            <Wallet className="size-4" /> Connect a wallet
          </Button>
        }
      />
    </div>
  );
}

/** Shown wherever a page needs a signer and none is chosen yet. */
export function ConnectPrompt({ title, body }: { title: string; body: string }) {
  return (
    <EmptyState
      className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-panel/60"
      icon={<Wallet className="size-4" />}
      title={title}
      body={body}
      action={<ConnectButtons size="sm" />}
    />
  );
}
