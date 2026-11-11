"use client";

import { FormEvent, useEffect, useState } from "react";
import { useWallet } from "@/components/wallet";
import { statusTone } from "@/lib/chain";
import { nearblocksAccount, shortAccount } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STEPS = [
  "Origin wallet",
  "1Click deposit quote",
  "Intents balance",
  "Signed order",
  "Match simulation",
  "Withdraw",
];

const STATUSES = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "INCOMPLETE_DEPOSIT", "REFUNDED", "FAILED"];

export function FundsScreen() {
  const wallet = useWallet();
  const account = wallet.session?.accountId ?? "";
  const [balances, setBalances] = useState<{ tokenId: string; amount: string }[]>([]);
  const [amount, setAmount] = useState("20");
  const [refundTo, setRefundTo] = useState("0x0000000000000000000000000000000000000001");
  const [quote, setQuote] = useState<unknown>(null);
  const [quoteError, setQuoteError] = useState("");
  const [depositAddress, setDepositAddress] = useState("");
  const [status, setStatus] = useState<unknown>(null);
  const [balanceError, setBalanceError] = useState("");

  useEffect(() => {
    if (!account) return;
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

  async function onQuote(event: FormEvent) {
    event.preventDefault();
    setQuoteError("");
    setQuote(null);
    const res = await fetch("/api/v1/deposit-quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount, account, refundTo }),
    });
    const data = await res.json();
    if (!res.ok) {
      setQuoteError(data.error || "Quote failed");
      return;
    }
    setQuote(data.quote);
  }

  async function onStatus(event: FormEvent) {
    event.preventDefault();
    const res = await fetch(`/api/v1/status?depositAddress=${encodeURIComponent(depositAddress)}`);
    setStatus(await res.json());
  }

  const quoteBody = quote as { quote?: { amountOutFormatted?: string; timeEstimate?: number } } | null;
  const statusValue =
    status && typeof status === "object" && "result" in status
      ? (status as { result?: { status?: string } }).result?.status
      : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="space-y-4">
        <div>
          <h1 className="font-display text-4xl">Where the funds sit</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Dry-run never asks you to send tokens. The balance query and the deposit quote are live reads. A non-dry quote, which would
            return a deposit address, is not requested.
          </p>
        </div>
        <ol className="space-y-2">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3">
              <span className="nums w-6 text-sm text-lime">{index + 1}</span>
              <div>
                <p className="text-sm">{step}</p>
                <p className="text-xs text-muted">{stepCopy(index, Boolean(quote), balances.length > 0)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-lg border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm">Intents balances</h2>
            {account ? (
              <a className="text-xs text-lime" href={nearblocksAccount(account)}>
                {shortAccount(account)} on NearBlocks
              </a>
            ) : null}
          </div>
          {balanceError ? <p className="mt-3 text-sm text-ask">{balanceError}</p> : null}
          {balances.length === 0 ? <p className="mt-3 text-sm text-muted">Querying intents.near.</p> : null}
          <ul className="mt-3 space-y-2">
            {balances.map((row) => (
              <li key={row.tokenId} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-muted">{row.tokenId.replace("nep141:", "")}</span>
                <span className="nums">{row.amount}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">A new demo key is unfunded, so these amounts are zero. That is the expected dry-run state.</p>
        </div>
      </section>
      <section className="space-y-4">
        <form onSubmit={onQuote} className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm">Quote a Base USDC deposit</h2>
          <p className="mt-1 text-xs text-muted">POST /v0/quote with dry: true, origin Base USDC, destination canonical USDC, recipientType INTENTS.</p>
          <label className="mt-3 block text-xs text-muted" htmlFor="amount">
            USDC amount
          </label>
          <Input id="amount" className="mt-1" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <label className="mt-3 block text-xs text-muted" htmlFor="refund">
            Refund address (EVM)
          </label>
          <Input id="refund" className="mt-1 nums" value={refundTo} onChange={(event) => setRefundTo(event.target.value)} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit">Get dry quote</Button>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setQuoteError("");
                setQuote(null);
                const res = await fetch("/api/v1/deposit-quote", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ amount, account, refundTo, dry: false }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setQuoteError(data.error || "Quote failed");
                  return;
                }
                setQuote(data.quote);
                const address = data.quote?.quote?.depositAddress;
                if (typeof address === "string") setDepositAddress(address);
              }}
            >
              Create deposit address
            </Button>
          </div>
          {quoteError ? <p className="mt-3 text-sm text-ask">{quoteError}</p> : null}
          {quoteBody?.quote ? (
            <p className="mt-3 text-sm">
              You would receive about {quoteBody.quote.amountOutFormatted} USDC inside Intents
              {quoteBody.quote.timeEstimate ? `, estimate ${quoteBody.quote.timeEstimate}s` : ""}. Not executed.
            </p>
          ) : null}
          {quote ? (
            <pre className="nums mt-3 max-h-48 overflow-auto text-xs">{JSON.stringify(quote, null, 2)}</pre>
          ) : null}
        </form>
        <form onSubmit={onStatus} className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-sm">Look up a 1Click deposit</h2>
          <p className="mt-1 text-xs text-muted">GET /v0/status. Paste a deposit address if you have one. Unknown addresses return the API error.</p>
          <Input className="mt-3" value={depositAddress} onChange={(event) => setDepositAddress(event.target.value)} placeholder="deposit address" />
          <Button className="mt-3" type="submit" variant="outline">
            Check status
          </Button>
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUSES.map((item) => (
              <Badge key={item} value={item} />
            ))}
          </div>
          {statusValue ? (
            <div className="mt-3">
              <Badge value={statusValue} />
            </div>
          ) : null}
          {status ? <pre className="nums mt-3 max-h-48 overflow-auto text-xs">{JSON.stringify(status, null, 2)}</pre> : null}
          {statusTone(statusValue) === "bad" ? (
            <p className="mt-3 text-sm text-ask">
              This deposit is {statusValue}. Funds were not credited. Check the refund address and the 1Click status before sending more.
            </p>
          ) : null}
          {statusTone(statusValue) === "wait" ? (
            <p className="mt-3 text-sm text-muted">Status is {statusValue}. This page polls every 8 seconds. Nothing has been executed by the server.</p>
          ) : null}
        </form>
        <form
          className="rounded-lg border border-line bg-panel p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setQuoteError("");
            const res = await fetch("/api/v1/near-deposit", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ tokenContract: "wrap.near", amount: "1000000000000000000000000", owner: account }),
            });
            const data = await res.json();
            if (!res.ok) {
              setQuoteError(data.error || "Could not build the deposit");
              return;
            }
            if (wallet.session?.kind !== "near") {
              setQuote(data);
              return;
            }
            try {
              const hash = await wallet.nearDeposit(data);
              setQuote({ ...data, txHash: hash, explorer: hash ? `https://nearblocks.io/txns/${hash}` : null });
            } catch (err) {
              setQuoteError(err instanceof Error ? err.message : "The wallet did not send the deposit");
            }
          }}
        >
          <h2 className="text-sm">Deposit wNEAR into intents.near</h2>
          <p className="mt-1 text-xs text-muted">
            ft_transfer_call on wrap.near. Your NEAR wallet signs it. The server never sends this transaction. Native NEAR is not accepted.
          </p>
          <Button className="mt-3" type="submit" variant="outline">
            {wallet.session?.kind === "near" ? "Deposit 1 wNEAR" : "Show the deposit call"}
          </Button>
        </form>
        <WithdrawForm account={account} />
      </section>
    </div>
  );
}

function stepCopy(index: number, quoted: boolean, balances: boolean) {
  const lines = [
    "Your own wallet. This demo key has not been funded.",
    quoted ? "A dry quote is on the right. No deposit address was created." : "Request a dry quote when you want a price.",
    balances ? "Live mt_batch_balance_of for this key." : "Balance query has not returned yet.",
    "A signed limit order leaves the balance spendable.",
    "A match is simulated. Unfunded keys stop at insufficient balance.",
    "Withdraw signs ft_withdraw or a 1Click quote. Dry-run does not broadcast it.",
  ];
  return lines[index];
}

function WithdrawForm({ account }: { account: string }) {
  const wallet = useWallet();
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
        body: JSON.stringify({ account, tokenId, receiverId: receiverId || account, amount, chain: "near" }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) throw new Error(preview.error || "Could not prepare the withdrawal");
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
    <form onSubmit={onSubmit} className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-sm">Withdraw to your own address</h2>
      <p className="mt-1 text-xs text-muted">
        ft_withdraw uses the token contract id without the nep141 prefix. Dry-run simulates and does not broadcast.
      </p>
      <label className="mt-3 block text-xs text-muted" htmlFor="withdraw-token">
        Token id
      </label>
      <Input id="withdraw-token" className="mt-1 nums" value={tokenId} onChange={(event) => setTokenId(event.target.value)} />
      <label className="mt-3 block text-xs text-muted" htmlFor="withdraw-to">
        Receiver
      </label>
      <Input id="withdraw-to" className="mt-1" value={receiverId} placeholder={account || "alice.near"} onChange={(event) => setReceiverId(event.target.value)} />
      <label className="mt-3 block text-xs text-muted" htmlFor="withdraw-amount">
        Amount in atoms
      </label>
      <Input id="withdraw-amount" className="mt-1 nums" value={amount} onChange={(event) => setAmount(event.target.value)} />
      <Button className="mt-3" type="submit" variant="outline">
        Sign and simulate withdraw
      </Button>
      {error ? <p className="mt-3 text-sm text-ask">{error}</p> : null}
      {result ? <pre className="nums mt-3 max-h-48 overflow-auto text-xs">{JSON.stringify(result, null, 2)}</pre> : null}
    </form>
  );
}
