"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { ConnectPrompt } from "@/components/site/connect-prompt";
import { useWallet } from "@/components/wallet";
import { AssetMark, symbolOf } from "@/components/ui/asset-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, SectionLabel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/states";
import { USDC_CONTRACT } from "@/lib/assets";
import { statusTone } from "@/lib/chain";
import { formatAtoms, nearblocksAccount, parseAtoms, shortAccount } from "@/lib/format";
import { cn } from "@/lib/cn";

const STEPS = ["Origin wallet", "Deposit quote", "Intents balance", "Signed order", "Match simulation", "Withdraw"];
const STATUSES = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "INCOMPLETE_DEPOSIT", "REFUNDED", "FAILED"];
const DECIMALS: Record<string, number> = { USDC: 6, BTC: 8, ETH: 18, SOL: 9, NEAR: 24 };
/** wrap.near storage minimum for a new holder: 0.00125 NEAR. */
const WRAP_STORAGE_YOCTO = 1_250_000_000_000_000_000_000n;

const tabClass =
  "relative -mb-px min-h-11 text-sm text-muted data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-lime";

function Raw({ value, label = "Raw response" }: { value: unknown; label?: string }) {
  if (!value) return null;
  return (
    <details className="group mt-3 rounded-sm border border-line">
      <summary className="nums flex min-h-9 cursor-pointer list-none items-center px-3 text-[0.6875rem] text-muted hover:text-ink">
        <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
        {label}
      </summary>
      <pre className="nums max-h-56 overflow-auto px-3 pb-3 text-[0.6875rem] leading-5">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

function Explain({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-5 text-muted">{children}</p>;
}

export function FundsScreen() {
  const wallet = useWallet();
  const account = wallet.session?.accountId ?? "";
  const [balances, setBalances] = useState<{ tokenId: string; amount: string }[] | null>(null);
  const [amount, setAmount] = useState("20");
  const [refundTo, setRefundTo] = useState("0x0000000000000000000000000000000000000001");
  const [quote, setQuote] = useState<unknown>(null);
  const [quoteError, setQuoteError] = useState("");
  const [depositAddress, setDepositAddress] = useState("");
  const [status, setStatus] = useState<unknown>(null);
  const [balanceError, setBalanceError] = useState("");

  useEffect(() => {
    if (!account) return;
    setBalances(null);
    fetch(`/api/v1/balances?account=${account}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Balance query failed");
        setBalances(data.balances ?? []);
      })
      .catch((err: Error) => setBalanceError(err.message));
  }, [account]);

  useEffect(() => {
    if (!depositAddress) return;
    let stop = false;
    async function poll() {
      const res = await fetch(`/api/v1/status?depositAddress=${encodeURIComponent(depositAddress)}`);
      if (!stop) setStatus(await res.json());
    }
    void poll();
    const timer = setInterval(() => void poll(), 8000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [depositAddress]);

  async function requestQuote(dry: boolean) {
    setQuoteError("");
    setQuote(null);
    const res = await fetch("/api/v1/deposit-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount, account, refundTo, dry }),
    });
    const data = await res.json();
    if (!res.ok) {
      setQuoteError(data.error || "Quote failed");
      return;
    }
    setQuote(data.quote);
    const address = data.quote?.quote?.depositAddress;
    if (!dry && typeof address === "string") setDepositAddress(address);
  }

  async function onStatus(event: FormEvent) {
    event.preventDefault();
    const res = await fetch(`/api/v1/status?depositAddress=${encodeURIComponent(depositAddress)}`);
    setStatus(await res.json());
  }

  const quoteBody = quote as { quote?: { amountOutFormatted?: string; timeEstimate?: number } } | null;
  const statusValue =
    status && typeof status === "object" && "result" in status ? (status as { result?: { status?: string } }).result?.status : undefined;
  const funded = (balances ?? []).some((row) => row.amount !== "0");
  const reached = [true, Boolean(quote), funded, false, false, false];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Funds"
        title={
          <>
            Your money stays <span className="italic text-lime">yours.</span>
          </>
        }
        description="Balances live in your own account inside intents.near. IntentBook only reads them. Deposits and withdrawals are signed by your wallet, and dry-run never asks you to send tokens."
        action={
          account ? (
            <Button asChild variant="outline" size="sm">
              <a href={nearblocksAccount(account)} target="_blank" rel="noreferrer">
                {shortAccount(account)} on NearBlocks ↗︎
              </a>
            </Button>
          ) : null
        }
      />

      <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {STEPS.map((step, index) => (
          <li key={step} className={cn("bg-panel px-4 py-3", reached[index] ? "" : "opacity-70")}>
            <p className={cn("nums text-[0.6875rem]", reached[index] ? "text-lime" : "text-faint")}>{String(index + 1).padStart(2, "0")}</p>
            <p className="mt-1 text-sm">{step}</p>
            <p className="mt-1 text-[0.6875rem] leading-4 text-muted">{stepCopy(index, Boolean(quote), funded)}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Panel label="Balances inside intents.near" action={<span className="nums text-[0.625rem] text-faint">mt_batch_balance_of</span>}>
          {balanceError ? <p className="text-sm text-ask">{balanceError}</p> : null}
          {!account ? (
            wallet.ready ? (
              <ConnectPrompt title="Choose a signer to see balances" body="Balances are read from that signer's account inside intents.near." />
            ) : (
              <Skeleton lines={5} />
            )
          ) : balances === null && !balanceError ? (
            <Skeleton lines={5} />
          ) : null}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {(balances ?? []).map((row) => {
              const symbol = symbolOf(row.tokenId);
              const human = formatAtoms(BigInt(row.amount || "0"), DECIMALS[symbol] ?? 0, 8);
              return (
                <li key={row.tokenId} className="flex items-center gap-3 rounded-sm border border-line bg-background/50 px-3 py-2.5">
                  <AssetMark symbol={symbol} />
                  <span className="flex-1 text-sm">{symbol}</span>
                  <span className={cn("nums text-sm", row.amount === "0" ? "text-faint" : "text-ink")}>{human}</span>
                </li>
              );
            })}
          </ul>
          {balances && !funded ? (
            <p className="mt-3 text-xs leading-5 text-muted">This signer has no balance yet. That is expected in dry-run: fills simulate and stop at the balance check.</p>
          ) : null}
        </Panel>

        <Panel bodyClassName="pt-0">
          <Tabs.Root defaultValue="deposit">
            <Tabs.List className="flex gap-6 border-b border-line" aria-label="Move funds">
              <Tabs.Trigger value="deposit" className={tabClass}>
                Deposit
              </Tabs.Trigger>
              <Tabs.Trigger value="track" className={tabClass}>
                Track
              </Tabs.Trigger>
              <Tabs.Trigger value="withdraw" className={tabClass}>
                Withdraw
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="deposit" className="space-y-6 pt-4">
              <NearDeposit account={account} />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void requestQuote(true);
                }}
                className="space-y-3 border-t border-line pt-5"
              >
                <SectionLabel>From Base · USDC via 1Click</SectionLabel>
                <Explain>A dry quote from Base USDC into canonical USDC in your Intents account. No deposit address is created.</Explain>
                <div className="grid gap-3 sm:grid-cols-[0.6fr_1.4fr]">
                  <Field label="USDC" htmlFor="amount">
                    <Input id="amount" className="nums" value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
                  </Field>
                  <Field label="Refund address on Base" htmlFor="refund">
                    <Input id="refund" className="nums" value={refundTo} onChange={(event) => setRefundTo(event.target.value)} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="cream">
                    Get dry quote
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void requestQuote(false)}>
                    Create deposit address
                  </Button>
                </div>
                {quoteError ? <p className="text-sm text-ask">{quoteError}</p> : null}
                {quoteBody?.quote ? (
                  <p className="rounded-sm border border-lime/30 bg-lime/[0.05] px-3 py-2 text-sm">
                    You would receive about <span className="nums">{quoteBody.quote.amountOutFormatted}</span> USDC inside Intents
                    {quoteBody.quote.timeEstimate ? ` in about ${quoteBody.quote.timeEstimate}s` : ""}. Nothing was executed.
                  </p>
                ) : null}
                <Raw value={quote} />
              </form>
            </Tabs.Content>

            <Tabs.Content value="track" className="pt-4">
              <form onSubmit={onStatus} className="space-y-3">
                <SectionLabel>1Click deposit status</SectionLabel>
                <Explain>Paste a deposit address. The page polls GET /v0/status every 8 seconds and flags refunds and failures.</Explain>
                <div className="flex gap-2">
                  <Input value={depositAddress} onChange={(event) => setDepositAddress(event.target.value)} placeholder="deposit address" className="nums" />
                  <Button type="submit" variant="outline">
                    Check
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((item) => (
                    <span key={item} className={cn(statusValue && statusValue !== item ? "opacity-40" : "")}>
                      <Badge value={item} />
                    </span>
                  ))}
                </div>
                {statusTone(statusValue) === "bad" ? (
                  <p className="text-sm text-ask">This deposit is {statusValue}. Funds were not credited. Check the refund address before sending more.</p>
                ) : null}
                {statusTone(statusValue) === "wait" ? <p className="text-sm text-muted">Status is {statusValue}. Still polling.</p> : null}
                <Raw value={status} />
              </form>
            </Tabs.Content>

            <Tabs.Content value="withdraw" className="pt-4">
              <WithdrawForm account={account} />
            </Tabs.Content>
          </Tabs.Root>
        </Panel>
      </div>
    </div>
  );
}

function stepCopy(index: number, quoted: boolean, funded: boolean) {
  const lines = [
    "Any chain NEAR Intents supports.",
    quoted ? "Dry quote received." : "Ask for a dry quote below.",
    funded ? "Funded." : "Empty until you deposit.",
    "Signing does not lock funds.",
    "simulate_intents on mainnet.",
    "Back to your own address.",
  ];
  return lines[index];
}

/**
 * Deposit into intents.near from the connected NEAR wallet, credited to any account.
 * "NEAR" wraps native NEAR (near_deposit) and deposits it in the same transaction.
 */
function NearDeposit({ account }: { account: string }) {
  const wallet = useWallet();
  const [token, setToken] = useState<"NEAR" | "wNEAR" | "USDC">("NEAR");
  const [amount, setAmount] = useState("0.1");
  const [creditTo, setCreditTo] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");
  const isNear = wallet.session?.kind === "near";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    const decimals = token === "USDC" ? 6 : 24;
    const atoms = parseAtoms(amount, decimals);
    if (!atoms || atoms <= 0n) {
      setError("Enter a positive amount");
      return;
    }
    const res = await fetch("/api/v1/near-deposit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenContract: token === "USDC" ? USDC_CONTRACT : "wrap.near",
        amount: atoms.toString(),
        owner: creditTo.trim() || account,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not build the deposit");
      return;
    }
    // wrap.near registers a new holder out of the attached NEAR, so attach the storage minimum on top.
    const wrap = { methodName: "near_deposit", args: {}, gas: "10000000000000", deposit: (atoms + WRAP_STORAGE_YOCTO).toString() };
    const calls = token === "NEAR" ? [wrap, data] : [data];
    if (!isNear) {
      setResult({ receiverId: data.receiverId, calls });
      return;
    }
    try {
      const hash = await wallet.nearCalls(data.receiverId, calls);
      setResult({ receiverId: data.receiverId, calls, txHash: hash, explorer: hash ? `https://nearblocks.io/txns/${hash}` : null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The wallet did not send the deposit");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <SectionLabel>From a NEAR wallet · ft_transfer_call</SectionLabel>
      <Explain>
        Your NEAR wallet sends the token to intents.near and the balance is credited to the account below. Choosing NEAR wraps it into wNEAR in the
        same transaction. The server never sends this.
      </Explain>
      <div className="grid grid-cols-3 rounded-sm border border-line-strong p-1">
        {(["NEAR", "wNEAR", "USDC"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setToken(value)}
            className={cn("h-9 rounded-[2px] text-sm", token === value ? "bg-ink text-background" : "text-muted hover:text-ink")}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[0.6fr_1.4fr]">
        <Field label={token} htmlFor="near-amount">
          <Input id="near-amount" className="nums" value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Credit to account" htmlFor="credit-to">
          <Input id="credit-to" className="nums" value={creditTo} placeholder={account || "you.near"} onChange={(event) => setCreditTo(event.target.value)} />
        </Field>
      </div>
      <Button type="submit" variant={isNear ? "cream" : "outline"}>
        {isNear ? `Deposit ${amount} ${token}` : "Show the deposit call"}
      </Button>
      {!isNear ? <p className="text-[0.6875rem] text-faint">Connect a NEAR wallet to send it. Other signers see the unsigned calls.</p> : null}
      {error ? <p className="text-sm text-ask">{error}</p> : null}
      <Raw value={result} label="Deposit calls" />
    </form>
  );
}

function WithdrawForm({ account }: { account: string }) {
  const wallet = useWallet();
  const [chain, setChain] = useState<"near" | "base">("near");
  const [tokenId, setTokenId] = useState("nep141:wrap.near");
  const [receiverId, setReceiverId] = useState("");
  const [amount, setAmount] = useState("1000000000000000000000000");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setResult(null);
    try {
      const previewRes = await fetch("/api/v1/withdraw/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          account,
          tokenId: chain === "base" ? "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1" : tokenId,
          receiverId: receiverId || account,
          amount: chain === "base" ? String(Math.round(Number(amount) * 1_000_000)) : amount,
          chain: chain === "base" ? "other" : "near",
          destinationAsset: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
          dry: true,
          standard: wallet.standard,
        }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) throw new Error(preview.error || "Could not prepare the withdrawal");
      if (chain === "base") {
        setResult(preview);
        return;
      }
      const signed = await wallet.signLeg(preview);
      const res = await fetch("/api/v1/withdraw", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account, signed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdraw failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <SectionLabel>Withdraw to your own address</SectionLabel>
      <Explain>
        NEAR signs an ft_withdraw and stops at simulation in dry-run. Base asks 1Click for a dry quote from Intents USDC. The server does not broadcast
        either in dry-run.
      </Explain>
      <div className="grid grid-cols-2 rounded-sm border border-line-strong p-1">
        {(
          [
            { id: "near", label: "To NEAR" },
            { id: "base", label: "To Base" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setChain(option.id);
              if (option.id === "near") {
                setAmount("1000000000000000000000000");
                setTokenId("nep141:wrap.near");
              } else setAmount("20");
            }}
            className={cn("h-9 rounded-[2px] text-sm", chain === option.id ? "bg-ink text-background" : "text-muted hover:text-ink")}
          >
            {option.label}
          </button>
        ))}
      </div>
      {chain === "near" ? (
        <Field label="Token id" htmlFor="withdraw-token">
          <Input id="withdraw-token" className="nums" value={tokenId} onChange={(event) => setTokenId(event.target.value)} />
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Receiver" htmlFor="withdraw-to">
          <Input id="withdraw-to" className="nums" value={receiverId} placeholder={account || "alice.near"} onChange={(event) => setReceiverId(event.target.value)} />
        </Field>
        <Field label={chain === "base" ? "USDC" : "Amount in atoms"} htmlFor="withdraw-amount">
          <Input id="withdraw-amount" className="nums" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
      </div>
      <Button type="submit" variant="cream">
        {chain === "base" ? "Quote Base withdrawal" : "Sign and simulate withdraw"}
      </Button>
      {error ? <p className="text-sm text-ask">{error}</p> : null}
      <Raw value={result} />
    </form>
  );
}
