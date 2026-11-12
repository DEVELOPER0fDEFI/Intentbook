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

export type WalletKind = "demo" | "near" | "evm" | "solana";

export interface WalletSession {
  kind: WalletKind;
  accountId: string;
  publicKey?: string;
}

/** The signing standard to request in previews, so the server builds the payload this wallet can sign. */
export function standardFor(session: WalletSession | null): SignStandard {
  if (session?.kind === "evm") return "erc191";
  if (session?.kind === "solana") return "raw_ed25519";
  return "nep413";
}

interface WalletApi {
  session: WalletSession | null;
  /** Send this as `standard` in every preview request. */
  standard: SignStandard;
  /** False until a saved session has been restored or ruled out. */
  ready: boolean;
  busy: boolean;
  error: string;
  connectNear: () => Promise<void>;
  connectEvm: () => Promise<void>;
  connectSolana: () => Promise<void>;
  /** Signs out of the current wallet and leaves the visitor disconnected. */
  disconnect: () => Promise<void>;
  registerNearKey: () => Promise<void>;
  /** Creates (or reuses) the browser demo key and selects it. */
  selectDemo: () => void;
  signLeg: (leg: SignLeg) => Promise<SignedIntent>;
  nearDeposit: (call: NearCall) => Promise<string>;
  /** Several function calls to one contract in a single wallet transaction. */
  nearCalls: (receiverId: string, calls: Omit<NearCall, "receiverId">[]) => Promise<string>;
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

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  providers?: Eip1193[];
};

type SolanaKey = { toBytes: () => Uint8Array; toString: () => string };

type PhantomSolana = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: SolanaKey | null;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: SolanaKey }>;
  disconnect?: () => Promise<void>;
  signMessage: (message: Uint8Array, display: string) => Promise<{ signature: Uint8Array }>;
};

let evmProvider: Eip1193 | null = null;

/**
 * Finds MetaMask specifically. Phantom, Coinbase and Rabby also inject window.ethereum,
 * so ask wallets to announce themselves (EIP-6963) and pick MetaMask by its rdns.
 */
async function findEvmProvider(): Promise<Eip1193 | null> {
  if (evmProvider) return evmProvider;
  const announced: { info?: { rdns?: string; name?: string }; provider: Eip1193 }[] = [];
  const onAnnounce = (event: Event) => announced.push((event as CustomEvent).detail);
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, 200));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);
  const metamask =
    announced.find((item) => item.info?.rdns === "io.metamask") ?? announced.find((item) => /metamask/i.test(item.info?.name ?? ""));
  const injected = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  evmProvider =
    metamask?.provider ??
    injected?.providers?.find((item) => item.isMetaMask && !item.isPhantom) ??
    (injected?.isMetaMask && !injected.isPhantom ? injected : null) ??
    announced[0]?.provider ??
    injected ??
    null;
  return evmProvider;
}

/** Phantom's own Solana provider. window.solana can belong to another wallet. */
function findPhantom(): PhantomSolana | null {
  const w = window as unknown as { phantom?: { solana?: PhantomSolana }; solana?: PhantomSolana };
  return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
}

function hexOf(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface NearCall {
  receiverId: string;
  methodName: string;
  args: Record<string, string>;
  gas: string;
  deposit: string;
}

function prefixKey(value: string, kind: "ed25519"): string {
  return value.startsWith(`${kind}:`) ? value : `${kind}:${value}`;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const savedRaw = window.sessionStorage.getItem(STORAGE);
      const parsed = savedRaw ? (JSON.parse(savedRaw) as WalletSession) : null;
      // Sessions from older builds (such as the removed passkey wallet) fall back to the demo key.
      const saved = parsed && ["demo", "near", "evm", "solana"].includes(parsed.kind) ? parsed : null;
      if (saved?.kind === "evm") {
        try {
          const ethereum = await findEvmProvider();
          const accounts = ((await ethereum?.request({ method: "eth_accounts" })) ?? []) as string[];
          if (accounts[0]) {
            remember({ kind: "evm", accountId: accounts[0].toLowerCase() });
            return;
          }
        } catch {
          // MetaMask is locked or not connected. Fall back below.
        }
      }
      if (saved?.kind === "solana") {
        try {
          const connected = await findPhantom()?.connect({ onlyIfTrusted: true });
          if (connected && hexOf(connected.publicKey.toBytes()) === saved.accountId) {
            setSession(saved);
            return;
          }
        } catch {
          // Phantom needs the user to approve again. Fall back below.
        }
      }
      if (!saved || saved.kind === "near") {
        try {
          const [{ setupWalletSelector }, { setupMeteorWallet }, { setupHotWallet }, { setupMyNearWallet }, { setupHereWallet }] = await Promise.all([
            import("@near-wallet-selector/core"),
            import("@near-wallet-selector/meteor-wallet"),
            import("@near-wallet-selector/hot-wallet"),
            import("@near-wallet-selector/my-near-wallet"),
            import("@near-wallet-selector/here-wallet"),
          ]);
          const selector = await setupWalletSelector({
            network: "mainnet",
            modules: [setupMeteorWallet(), setupHotWallet(), setupMyNearWallet(), setupHereWallet()],
          });
          const accounts = selector.store.getState().accounts;
          if (accounts[0]) {
            nearWallet = (await selector.wallet()) as NearWallet;
            remember({ kind: "near", accountId: accounts[0].accountId, publicKey: accounts[0].publicKey });
            return;
          }
        } catch {
          // No NEAR session to restore.
        }
      }
      if (saved?.kind === "demo") {
        setSession({ kind: "demo", accountId: loadDemoKey().accountId });
        return;
      }
      // Nothing to restore: stay disconnected until the visitor picks a signer.
    })().finally(() => setReady(true));
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
      const ethereum = await findEvmProvider();
      if (!ethereum) throw new Error("MetaMask is not installed in this browser");
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const accountId = accounts[0];
      if (!accountId) throw new Error("MetaMask did not return an account");
      remember({ kind: "evm", accountId: accountId.toLowerCase() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect MetaMask");
    } finally {
      setBusy(false);
    }
  }

  async function connectSolana() {
    setBusy(true);
    setError("");
    try {
      const provider = findPhantom();
      if (!provider) throw new Error("Phantom is not installed in this browser");
      const connected = await provider.connect();
      remember({ kind: "solana", accountId: hexOf(connected.publicKey.toBytes()), publicKey: `ed25519:${connected.publicKey.toString()}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Phantom");
    } finally {
      setBusy(false);
    }
  }

  async function registerNearKey() {
    if (!session || session.kind !== "near" || !session.publicKey) {
      setError("Connect a named NEAR account before registering its key");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/keys?account=${encodeURIComponent(session.accountId)}&publicKey=${encodeURIComponent(session.publicKey)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not check the key");
      if (data.registered === true) {
        setError("This key is already registered on intents.near");
        return;
      }
      const hash = await nearDeposit(data.call);
      setError(hash ? `Key registration submitted: ${hash}` : "Confirm the wallet prompt to register the key");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register the key");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    try {
      if (session?.kind === "near" && nearWallet && "signOut" in nearWallet) {
        await (nearWallet as unknown as { signOut: () => Promise<void> }).signOut();
      }
      if (session?.kind === "solana") await findPhantom()?.disconnect?.();
    } catch {
      // Signing out of the wallet is best effort. The session is cleared either way.
    }
    nearWallet = null;
    setSession(null);
    window.sessionStorage.removeItem(STORAGE);
    setError("");
  }

  function selectDemo() {
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
    if (session.kind === "solana") {
      if (leg.standard !== "raw_ed25519") throw new Error("Phantom signs raw_ed25519 payloads. Review the order again.");
      const provider = findPhantom();
      if (!provider) throw new Error("Phantom is not installed in this browser");
      const current = provider.isConnected && provider.publicKey ? provider.publicKey : (await provider.connect()).publicKey;
      if (hexOf(current.toBytes()) !== session.accountId) {
        throw new Error("Phantom is on a different account now. Choose Phantom again in Connect.");
      }
      const signed = await provider.signMessage(new TextEncoder().encode(leg.message), "utf8");
      const bs58mod = await import("bs58");
      return {
        standard: "raw_ed25519",
        payload: leg.message,
        public_key: session.publicKey || "",
        signature: `ed25519:${bs58mod.default.encode(signed.signature)}`,
      };
    }
    const ethereum = await findEvmProvider();
    if (!ethereum) throw new Error("MetaMask is not installed in this browser");
    const active = ((await ethereum.request({ method: "eth_accounts" })) as string[]).map((item) => item.toLowerCase());
    if (!active.includes(session.accountId.toLowerCase())) {
      throw new Error("MetaMask is locked or on a different account. Unlock it, or choose MetaMask again in Connect.");
    }
    const hex = `0x${[...new TextEncoder().encode(leg.message)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const signature = (await ethereum.request({ method: "personal_sign", params: [hex, session.accountId] })) as string;
    return packEthSignature(leg.message, signature);
  }

  async function nearCalls(receiverId: string, calls: Omit<NearCall, "receiverId">[]) {
    if (!nearWallet?.signAndSendTransaction) throw new Error("Connect a NEAR wallet to send this from NEAR");
    const outcome = await nearWallet.signAndSendTransaction({
      receiverId,
      actions: calls.map((call) => ({
        type: "FunctionCall" as const,
        params: { methodName: call.methodName, args: call.args, gas: call.gas, deposit: call.deposit },
      })),
    });
    return outcome?.transaction?.hash || "";
  }

  async function nearDeposit(call: NearCall) {
    return nearCalls(call.receiverId, [call]);
  }

  const value: WalletApi = {
    session,
    standard: standardFor(session),
    ready,
    busy,
    error,
    connectNear,
    connectEvm,
    connectSolana,
    disconnect,
    registerNearKey,
    selectDemo,
    signLeg,
    nearDeposit,
    nearCalls,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletApi {
  const value = useContext(WalletContext);
  if (!value) throw new Error("WalletProvider is missing");
  return value;
}
