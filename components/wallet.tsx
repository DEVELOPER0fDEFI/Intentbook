"use client";

import "@near-wallet-selector/modal-ui/styles.css";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { packEthSignature } from "@/lib/erc191";
import { loadDemoKey, signExisting } from "@/lib/demo-wallet";
import { base64ToBytes } from "@/lib/nep413";
import type { SignStandard, SignedIntent } from "@/lib/types";

interface SignLeg {
  message: string;
  nonce: string;
  standard: SignStandard;
}

export type WalletKind = "demo" | "near" | "evm";

export interface WalletSession {
  kind: WalletKind;
  accountId: string;
  publicKey?: string;
}

interface WalletApi {
  session: WalletSession | null;
  busy: boolean;
  error: string;
  connectNear: () => Promise<void>;
  connectEvm: () => Promise<void>;
  useDemo: () => void;
  signLeg: (leg: SignLeg) => Promise<SignedIntent>;
  nearDeposit: (call: { receiverId: string; methodName: string; args: Record<string, string>; gas: string; deposit: string }) => Promise<string>;
}

const WalletContext = createContext<WalletApi | null>(null);
const STORAGE = "intentbook.wallet";

type NearWallet = {
  signMessage?: (params: { message: string; recipient: string; nonce: Buffer }) => Promise<{ accountId: string; publicKey: string; signature: string } | void>;
  signAndSendTransaction?: (params: {
    receiverId: string;
    actions: Array<{ type: "FunctionCall"; params: { methodName: string; args: Record<string, string>; gas: string; deposit: string } }>;
  }) => Promise<{ transaction?: { hash?: string } } | void>;
  getAccounts: () => Promise<Array<{ accountId: string; publicKey?: string }>>;
};

let nearWallet: NearWallet | null = null;

function prefixKey(value: string, kind: "ed25519"): string {
  return value.startsWith(`${kind}:`) ? value : `${kind}:${value}`;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const demo = loadDemoKey();
    const saved = window.sessionStorage.getItem(STORAGE);
    if (saved) {
      try {
        setSession(JSON.parse(saved) as WalletSession);
        return;
      } catch {
        window.sessionStorage.removeItem(STORAGE);
      }
    }
    setSession({ kind: "demo", accountId: demo.accountId });
  }, []);

  function remember(next: WalletSession) {
    setSession(next);
    window.sessionStorage.setItem(STORAGE, JSON.stringify(next));
    setError("");
  }

  async function connectNear() {
    setBusy(true);
    setError("");
    try {
      const [{ setupWalletSelector }, { setupModal }, { setupMeteorWallet }, { setupHotWallet }, { setupMyNearWallet }, { setupHereWallet }] =
        await Promise.all([
          import("@near-wallet-selector/core"),
          import("@near-wallet-selector/modal-ui"),
          import("@near-wallet-selector/meteor-wallet"),
          import("@near-wallet-selector/hot-wallet"),
          import("@near-wallet-selector/my-near-wallet"),
          import("@near-wallet-selector/here-wallet"),
        ]);
      const selector = await setupWalletSelector({
        network: "mainnet",
        modules: [setupMeteorWallet(), setupHotWallet(), setupMyNearWallet(), setupHereWallet()],
      });
      const modal = setupModal(selector, { contractId: "intents.near" });
      modal.show();
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Wallet connection timed out")), 120000);
        const sub = selector.store.observable.subscribe((state) => {
          if (state.accounts.length > 0) {
            window.clearTimeout(timer);
            sub.unsubscribe();
            modal.hide();
            resolve();
          }
        });
      });
      const wallet = (await selector.wallet()) as NearWallet;
      nearWallet = wallet;
      const [account] = await wallet.getAccounts();
      if (!account) throw new Error("The wallet did not return an account");
      remember({ kind: "near", accountId: account.accountId, publicKey: account.publicKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect a NEAR wallet");
    } finally {
      setBusy(false);
    }
  }

  async function connectEvm() {
    setBusy(true);
    setError("");
    try {
      const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!ethereum) throw new Error("MetaMask is not available in this browser");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const accountId = accounts[0];
      if (!accountId) throw new Error("MetaMask did not return an account");
      remember({ kind: "evm", accountId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect MetaMask");
    } finally {
      setBusy(false);
    }
  }

  function useDemo() {
    const demo = loadDemoKey();
    nearWallet = null;
    remember({ kind: "demo", accountId: demo.accountId });
  }

  async function signLeg(leg: SignLeg): Promise<SignedIntent> {
    if (!session) throw new Error("Choose a wallet first");
    if (session.kind === "demo") {
      if (leg.standard !== "nep413") throw new Error("The demo key signs NEP-413 only");
      const key = loadDemoKey();
      return signExisting({ secretKey: key.secretKey, message: leg.message, nonceBase64: leg.nonce });
    }
    if (session.kind === "near") {
      if (!nearWallet?.signMessage) throw new Error("Reconnect the NEAR wallet before signing");
      const { Buffer } = await import("buffer");
      const signed = await nearWallet.signMessage({
        message: leg.message,
        recipient: "intents.near",
        nonce: Buffer.from(base64ToBytes(leg.nonce)),
      });
      if (!signed) throw new Error("The wallet closed without signing");
      return {
        standard: "nep413",
        payload: { recipient: "intents.near", nonce: leg.nonce, message: leg.message },
        public_key: prefixKey(signed.publicKey, "ed25519"),
        signature: prefixKey(signed.signature, "ed25519"),
      };
    }
    const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum) throw new Error("MetaMask is not available");
    const hex = `0x${[...new TextEncoder().encode(leg.message)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const signature = (await ethereum.request({ method: "personal_sign", params: [hex, session.accountId] })) as string;
    return packEthSignature(leg.message, signature);
  }

  async function nearDeposit(call: { receiverId: string; methodName: string; args: Record<string, string>; gas: string; deposit: string }) {
    if (!nearWallet?.signAndSendTransaction) throw new Error("Connect a NEAR wallet to deposit from NEAR");
    const outcome = await nearWallet.signAndSendTransaction({
      receiverId: call.receiverId,
      actions: [{ type: "FunctionCall", params: { methodName: call.methodName, args: call.args, gas: call.gas, deposit: call.deposit } }],
    });
    return outcome?.transaction?.hash || "";
  }

  const value: WalletApi = { session, busy, error, connectNear, connectEvm, useDemo, signLeg, nearDeposit };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletApi {
  const value = useContext(WalletContext);
  if (!value) throw new Error("WalletProvider is missing");
  return value;
}
