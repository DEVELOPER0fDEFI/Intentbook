export const PAIR_IDS = ["BTC-USDC", "ETH-USDC", "SOL-USDC", "NEAR-USDC"] as const;

export type PairId = (typeof PAIR_IDS)[number];
export type Side = "BUY" | "SELL";
export type OrderType = "LIMIT" | "MARKET";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED" | "EXPIRED" | "DEAD";
export type FillStatus = "SIMULATED" | "FAILED" | "SETTLED";
export type Settlement = "unfunded" | "executed" | "rejected" | "broadcast";
export type SignStandard = "nep413" | "erc191" | "raw_ed25519" | "webauthn";

export interface SignedNep413 {
  standard: "nep413";
  payload: {
    recipient: "intents.near";
    nonce: string;
    message: string;
  };
  public_key: string;
  signature: string;
}

export interface SignedErc191 {
  standard: "erc191";
  payload: string;
  signature: string;
}

export interface SignedRawEd25519 {
  standard: "raw_ed25519";
  payload: string;
  public_key: string;
  signature: string;
}

export interface SignedWebauthn {
  standard: "webauthn";
  payload: string;
  public_key: string;
  signature: string;
  client_data_json: string;
  authenticator_data: string;
}

export type SignedIntent = SignedNep413 | SignedErc191 | SignedRawEd25519 | SignedWebauthn;

export interface StoredOrder {
  id: string;
  pair: PairId;
  side: Side;
  price: string;
  priceAtoms: string;
  qty: string;
  originalQty: string;
  quoteQty: string;
  owner: string;
  role: "user" | "mm";
  signed: SignedIntent;
  nonce: string;
  deadline: string;
  createdAt: string;
  status: OrderStatus;
  memo: string;
  reservedBy?: string;
  reservedUntil?: string;
}

export interface Fill {
  id: string;
  pair: PairId;
  price: string;
  baseQty: string;
  quoteQty: string;
  makerIds: string[];
  makerAccounts: string[];
  takerAccount: string;
  status: FillStatus;
  settlement: Settlement;
  signaturesAccepted: boolean;
  simulate: unknown;
  closure: Record<string, string>;
  diffs: { account: string; diff: Record<string, string> }[];
  note: string;
  createdAt: string;
  fallback: unknown | null;
  fallbackError: string | null;
  takerFee?: string;
  takerFeeAtoms?: string;
  txHash?: string;
}

export interface PreparedLeg {
  message: string;
  nonce: string;
  recipient: "intents.near";
  standard: SignStandard;
  baseQty: string;
  quoteQty: string;
  price: string;
  fee: string;
  deadline: string;
  lotIds?: string[];
}

export interface Preview {
  previewId: string;
  account: string;
  pair: PairId;
  side: Side;
  orderType: OrderType;
  expiresAt: string;
  take: PreparedLeg | null;
  rest: PreparedLeg | null;
  fallback: unknown | null;
  fallbackError: string | null;
  warnings: string[];
  referrer?: string;
}
