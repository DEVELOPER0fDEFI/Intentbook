import fs from "node:fs";
import path from "node:path";
import { accountKind, sameAccount } from "./accounts";
import { activeFeeSchedule } from "./app-fees";
import { priceEdge, readQuoteAmounts, walkBook } from "./compare";
import { PAIRS, USDC_ASSET, USDC_CONTRACT } from "./assets";
import { ONCHAIN_CANCEL_NOTE, nearDepositCall, withdrawIntent } from "./chain";
import { closureForDeltas } from "./closure";
import { erc191FromNep413Message } from "./erc191";
import { MAKER_FEE_BPS, TAKER_FEE_BPS, takerLeg } from "./fees";
import {
  formatAtoms,
  formatUsd,
  isEvmAddress,
  parseAtoms,
  parsePriceAtoms,
  priceAtomsFromFill,
  quoteAtomsForBase,
} from "./format";
import { executionDecision, liveRequested, relayerConfigured } from "./live";
import { selectLots } from "./matcher";
import {
  emptyIntentMessage,
  generateKey,
  readDiffs,
  signEmptyIntent,
  signTokenDiff,
  tokenDiffMessage,
  verifySigned,
  bytesToBase64,
  makeNonce,
  nonceRejected,
  useLegacyNonces,
  type DemoKey,
} from "./nep413";
import { depositQuote, depositStatus, fallbackQuote, referencePrices, rheaSwapQuote, withdrawQuote, type ReferencePrice } from "./quotes";
import { broadcastExecute } from "./relayer";
import { routePlan } from "./route";
import { intentMessage, intentNonce, intentSigner, saltOf, verifyUserSignature } from "./signature";
import { buildCandles, CANDLE_INTERVALS, groupDepth, pickWinner, type CandleInterval } from "./market";
import { bookStore, hasNonce, rememberNonce } from "./store";
import { newWebhookSecret } from "./webhooks";
import type { Fill, PairId, PreparedLeg, Preview, Side, SignedIntent, SignStandard, StoredOrder } from "./types";
import { PAIR_IDS } from "./types";
import {
  batchBalances,
  interpretSimulation,
  hasPublicKey,
  nonceUsed,
  protocolState,
  simulateIntents,
} from "./verifier";

export class EngineError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface Memory {
  orders: StoredOrder[];
  fills: Fill[];
  previews: Map<string, Preview & { reservedIds: string[] }>;
  history: Record<PairId, { t: number; mid: number }[]>;
  mids: Partial<Record<PairId, ReferencePrice>>;
  listeners: Set<(event: { type: string; ts: number; pair?: string; trade?: unknown }) => void>;
  mm?: DemoKey;
  operator?: DemoKey;
  feePips?: number;
  salt?: string;
  feeCollector?: string;
  authProbe?: unknown;
  authAccount?: string;
  started: boolean;
}

const globalStore = globalThis as unknown as { __intentbook?: Memory };

function memory(): Memory {
  if (!globalStore.__intentbook) {
    globalStore.__intentbook = {
      orders: [],
      fills: [],
      previews: new Map(),
      history: { "BTC-USDC": [], "ETH-USDC": [], "SOL-USDC": [], "NEAR-USDC": [] },
      mids: {},
      listeners: new Set(),
      started: false,
    };
  }
  return globalStore.__intentbook;
}

const DATA_PATH = path.join(process.cwd(), ".data", "state.json");

function persist() {
  const state = memory();
  const orders = state.orders.filter((order) => order.role === "user");
  const fills = state.fills.slice(-500);
  bookStore().save({ orders, fills });
  const payload = { orders, fills };
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(payload));
}

function load() {
  const state = memory();
  try {
    const stored = bookStore().load();
    if (stored.orders.length === 0 && stored.fills.length === 0 && fs.existsSync(DATA_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as { orders?: StoredOrder[]; fills?: Fill[] };
      state.orders.push(...(parsed.orders ?? []).filter((order) => order.role === "user"));
      state.fills.push(...(parsed.fills ?? []));
      persist();
      return;
    }
    state.orders.push(...stored.orders.filter((order) => order.role === "user"));
    state.fills.push(...stored.fills);
  } catch {
    // Ignore a corrupt local file and start empty.
  }
}

function requireBookAccount(account: string): string {
  const id = account.trim();
  if (accountKind(id) === "invalid") {
    throw new EngineError(400, "Account must be a NEAR account, an implicit id, or an EVM address");
  }
  return accountKind(id) === "evm" ? id : id.toLowerCase();
}

function emit(type: string, extra: { pair?: string; trade?: unknown } = {}) {
  const event = { type, ts: Date.now(), ...extra };
  for (const listener of memory().listeners) listener(event);
}

export function subscribe(listener: (event: { type: string; ts: number; pair?: string; trade?: unknown }) => void): () => void {
  memory().listeners.add(listener);
  return () => memory().listeners.delete(listener);
}

let queue: Promise<unknown> = Promise.resolve();
function lock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function requirePair(value: string): PairId {
  if (!(PAIR_IDS as readonly string[]).includes(value)) throw new EngineError(400, "Unknown pair");
  return value as PairId;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function requireProtocol(): { feePips: number; salt: string } {
  const state = memory();
  if (state.feePips == null || !state.salt) throw new EngineError(503, "Protocol fee and salt are not loaded yet");
  return { feePips: state.feePips, salt: state.salt };
}

async function refreshProtocol() {
  const protocol = await protocolState();
  const state = memory();
  state.feePips = protocol.feePips;
  state.salt = protocol.salt;
  state.feeCollector = protocol.feeCollector;
}

function diffEntries(diff: Record<string, bigint>): [string, bigint][] {
  return Object.entries(diff);
}

function orderLots(pair: PairId, now: number) {
  return memory()
    .orders.filter((order) => order.status === "OPEN" && order.pair === pair)
    .map((order) => ({
      id: order.id,
      side: order.side,
      price: BigInt(order.priceAtoms),
      qty: BigInt(order.qty),
      createdAt: Date.parse(order.createdAt),
      deadline: Date.parse(order.deadline),
      reservedUntil: order.reservedUntil ? Date.parse(order.reservedUntil) : 0,
      now,
    }));
}

function publicOrder(order: StoredOrder) {
  const spec = PAIRS[order.pair];
  return {
    id: order.id,
    pair: order.pair,
    side: order.side,
    price: order.price,
    qty: formatAtoms(BigInt(order.qty), spec.baseDecimals, 8),
    qtyAtoms: order.qty,
    originalQty: formatAtoms(BigInt(order.originalQty), spec.baseDecimals, 8),
    quoteQty: formatUsd(BigInt(order.quoteQty)),
    owner: order.owner,
    role: order.role,
    status: order.status,
    deadline: order.deadline,
    createdAt: order.createdAt,
    memo: order.memo,
  };
}

function publicFill(fill: Fill) {
  return {
    id: fill.id,
    pair: fill.pair,
    price: fill.price,
    baseQty: fill.baseQty,
    quoteQty: fill.quoteQty,
    makerIds: fill.makerIds,
    makerAccounts: fill.makerAccounts,
    takerAccount: fill.takerAccount,
    status: fill.status,
    settlement: fill.settlement,
    signaturesAccepted: fill.signaturesAccepted,
    simulate: fill.simulate,
    closure: fill.closure,
    diffs: fill.diffs,
    note: fill.note,
    createdAt: fill.createdAt,
    fallback: fill.fallback,
    fallbackError: fill.fallbackError,
    takerFee: fill.takerFee ?? null,
    takerFeeAtoms: fill.takerFeeAtoms ?? null,
    txHash: fill.txHash ?? null,
    explorer: fill.txHash ? `https://nearblocks.io/txns/${fill.txHash}` : "https://nearblocks.io/address/intents.near",
  };
}

function levels(pair: PairId, side: Side) {
  const spec = PAIRS[pair];
  const now = Date.now();
  const grouped = new Map<string, { price: bigint; qty: bigint; orders: number }>();
  for (const order of memory().orders) {
    if (order.pair !== pair || order.side !== side || order.status !== "OPEN") continue;
    if (Date.parse(order.deadline) <= now) continue;
    if (order.reservedUntil && Date.parse(order.reservedUntil) > now) continue;
    const price = BigInt(order.priceAtoms);
    const key = price.toString();
    const row = grouped.get(key) ?? { price, qty: 0n, orders: 0 };
    row.qty += BigInt(order.qty);
    row.orders += 1;
    grouped.set(key, row);
  }
  const rows = [...grouped.values()].sort((a, b) => (side === "BUY" ? (a.price > b.price ? -1 : 1) : a.price < b.price ? -1 : 1));
  let cum = 0n;
  return rows.map((row) => {
    const quote = quoteAtomsForBase(row.qty, row.price, spec.baseDecimals);
    cum += quote;
    return {
      price: formatUsd(row.price),
      priceAtoms: row.price.toString(),
      qty: formatAtoms(row.qty, spec.baseDecimals, 8),
      qtyAtoms: row.qty.toString(),
      quote: formatUsd(quote),
      total: formatUsd(cum),
      orders: row.orders,
    };
  });
}

const backstopFailed = new Set<string>();
let mmSequence = 0;

function rememberMids(prices: ReferencePrice[]) {
  const state = memory();
  const now = Date.now();
  for (const price of prices) {
    state.mids[price.pair] = price;
    const series = state.history[price.pair];
    const mid = Number(formatUsd(price.midAtoms));
    if (Number.isFinite(mid)) series.push({ t: now, mid });
    if (series.length > 90) series.splice(0, series.length - 90);
  }
}

function cancelMm(pair: PairId) {
  const now = Date.now();
  for (const order of memory().orders) {
    if (order.role !== "mm" || order.pair !== pair || order.status !== "OPEN") continue;
    if (order.reservedUntil && Date.parse(order.reservedUntil) > now) continue;
    order.status = "CANCELLED";
  }
}

function placeMmOrder(pair: PairId, side: Side, priceAtoms: bigint, qty: bigint) {
  const state = memory();
  const protocol = requireProtocol();
  if (!state.mm) return;
  const spec = PAIRS[pair];
  const quote = quoteAtomsForBase(qty, priceAtoms, spec.baseDecimals);
  if (quote <= 0n) return;
  const deadline = iso(Date.now() + 24 * 60 * 60 * 1000);
  const diff =
    side === "SELL"
      ? { [spec.baseAsset]: (-qty).toString(), [USDC_ASSET]: quote.toString() }
      : { [spec.baseAsset]: qty.toString(), [USDC_ASSET]: (-quote).toString() };
  const memo = `intentbook:${pair}:${side}:${formatUsd(priceAtoms)}`;
  const signed = signTokenDiff({
    secretKey: state.mm.secretKey,
    deadline,
    diff,
    memo,
    saltHex: protocol.salt,
  });
  const order: StoredOrder = {
    id: crypto.randomUUID(),
    pair,
    side,
    price: formatUsd(priceAtoms),
    priceAtoms: priceAtoms.toString(),
    qty: qty.toString(),
    originalQty: qty.toString(),
    quoteQty: quote.toString(),
    owner: state.mm.accountId,
    role: "mm",
    signed,
    nonce: signed.payload.nonce,
    deadline,
    createdAt: new Date(Date.now() + mmSequence++).toISOString(),
    status: "OPEN",
    memo,
  };
  state.orders.push(order);
}

async function seedUnlocked() {
  const prices = await referencePrices();
  const state = memory();
  for (const price of prices) {
    const spec = PAIRS[price.pair];
    const lot = parseAtoms(spec.lot, spec.baseDecimals);
    if (!lot) continue;
    const previous = state.mids[price.pair]?.midAtoms;
    const drifted =
      !previous || previous === 0n
        ? true
        : (price.midAtoms > previous ? price.midAtoms - previous : previous - price.midAtoms) * 10000n / previous >= 5n;
    const openMm = state.orders.some((order) => order.role === "mm" && order.pair === price.pair && order.status === "OPEN");
    if (openMm && !drifted) continue;
    cancelMm(price.pair);
    for (let i = 0; i < 6; i++) {
      const bps = 8n + BigInt(i) * 6n;
      const ask = (price.midAtoms * (10000n + bps)) / 10000n;
      const bid = (price.midAtoms * (10000n - bps)) / 10000n;
      const qty = lot * BigInt(i + 1);
      placeMmOrder(price.pair, "SELL", ask, qty);
      placeMmOrder(price.pair, "BUY", bid, qty);
    }
  }
  rememberMids(prices);
  await backstopUnlocked();
  emit("book");
}

async function backstopUnlocked() {
  const state = memory();
  const now = Date.now();
  if (!state.mm || state.feePips == null || !state.salt) return;
  for (const order of [...state.orders]) {
    if (order.role !== "user" || order.status !== "OPEN") continue;
    if (order.reservedUntil && Date.parse(order.reservedUntil) > now) continue;
    if (backstopFailed.has(order.id)) continue;
    const mid = state.mids[order.pair]?.midAtoms;
    if (mid == null) continue;
    const price = BigInt(order.priceAtoms);
    const inMoney = order.side === "BUY" ? price >= mid : price <= mid;
    if (!inMoney) continue;
    try {
      const fill = await settleUnlocked({
        pair: order.pair,
        makerOrders: [order],
        takerKey: state.mm,
        note: "Market maker took this resting order at its limit. The limit was through the reference mid.",
        fallback: null,
        fallbackError: null,
      });
      if (fill.settlement === "rejected") backstopFailed.add(order.id);
    } catch {
      backstopFailed.add(order.id);
    }
  }
}

function release(ids: string[]) {
  const nowIso = new Date().toISOString();
  for (const order of memory().orders) {
    if (ids.includes(order.id) && order.reservedUntil && order.reservedUntil > nowIso) {
      order.reservedBy = undefined;
      order.reservedUntil = undefined;
    }
  }
}

async function settleUnlocked(input: {
  pair: PairId;
  makerOrders: StoredOrder[];
  takerKey?: DemoKey;
  takerSigned?: SignedIntent;
  note: string;
  fallback: unknown | null;
  fallbackError: string | null;
}): Promise<Fill> {
  const state = memory();
  const protocol = requireProtocol();
  const makerDiffs = input.makerOrders.map((order) => readDiffs(intentMessage(order.signed))[0]?.diff ?? {});
  const priced = takerLeg(makerDiffs, USDC_ASSET, TAKER_FEE_BPS);
  if (!input.takerSigned && !input.takerKey) throw new EngineError(500, "Missing taker signature");
  const takerSigned =
    input.takerSigned ??
    signTokenDiff({
      secretKey: input.takerKey!.secretKey,
      deadline: iso(Date.now() + 90_000),
      diff: priced.taker,
      memo: `intentbook:${input.pair}:TAKE`,
      saltHex: protocol.salt,
    });
  if (input.takerKey && takerSigned.standard === "nep413" && !verifySigned(takerSigned)) {
    throw new EngineError(400, "Taker signature was rejected locally");
  }
  const takerDiff = readDiffs(intentMessage(takerSigned))[0]?.diff ?? {};
  const takerAccount = JSON.parse(intentMessage(takerSigned)).signer_id as string;
  const deltas: [string, bigint][] = [];
  const diffs: Fill["diffs"] = [];
  for (const order of input.makerOrders) {
    const diff = readDiffs(intentMessage(order.signed))[0]?.diff ?? {};
    diffs.push({
      account: order.owner,
      diff: Object.fromEntries(Object.entries(diff).map(([token, amount]) => [token, amount.toString()])),
    });
    deltas.push(...diffEntries(diff));
  }
  diffs.push({
    account: takerAccount,
    diff: Object.fromEntries(Object.entries(takerDiff).map(([token, amount]) => [token, amount.toString()])),
  });
  deltas.push(...diffEntries(takerDiff));
  if (priced.fee > 0n) {
    for (const [token, amount] of Object.entries(priced.operator)) deltas.push([token, BigInt(amount)]);
  }
  const closure = closureForDeltas(deltas, BigInt(protocol.feePips));
  const closureDiff = Object.fromEntries([...closure.entries()].map(([token, amount]) => [token, amount.toString()]));
  const batch: SignedIntent[] = input.makerOrders.map((order) => order.signed);
  batch.push(takerSigned);
  if (!state.operator) throw new EngineError(500, "Operator key is missing");
  if (priced.fee > 0n) {
    const feeSigned = signTokenDiff({
      secretKey: state.operator.secretKey,
      deadline: iso(Date.now() + 10 * 60 * 1000),
      diff: priced.operator,
      memo: `intentbook:${input.pair}:FEE`,
      saltHex: protocol.salt,
    });
    batch.push(feeSigned);
    diffs.push({ account: state.operator.accountId, diff: priced.operator });
  }
  if (closure.size > 0) {
    if (!state.operator) throw new EngineError(500, "Operator key is missing");
    const closureSigned = signTokenDiff({
      secretKey: state.operator.secretKey,
      deadline: iso(Date.now() + 10 * 60 * 1000),
      diff: closureDiff,
      memo: `intentbook:${input.pair}:CLOSURE`,
      saltHex: protocol.salt,
    });
    batch.push(closureSigned);
    diffs.push({ account: state.operator.accountId, diff: closureDiff });
  }
  const simulate = await simulateIntents(batch);
  const verdict = interpretSimulation(simulate);
  const spec = PAIRS[input.pair];
  const baseDelta = takerDiff[spec.baseAsset] ?? 0n;
  const quoteDelta = takerDiff[USDC_ASSET] ?? 0n;
  const baseQty = baseDelta < 0n ? -baseDelta : baseDelta;
  const quoteQty = quoteDelta < 0n ? -quoteDelta : quoteDelta;
  const priceAtoms = priceAtomsFromFill(baseQty, quoteQty, spec.baseDecimals);
  const fill: Fill = {
    id: crypto.randomUUID(),
    pair: input.pair,
    price: formatUsd(priceAtoms),
    baseQty: formatAtoms(baseQty, spec.baseDecimals, 8),
    quoteQty: formatUsd(quoteQty),
    makerIds: input.makerOrders.map((order) => order.id),
    makerAccounts: input.makerOrders.map((order) => order.owner),
    takerAccount,
    status: verdict.kind === "rejected" ? "FAILED" : "SIMULATED",
    settlement: verdict.kind,
    signaturesAccepted: verdict.kind !== "rejected",
    simulate,
    closure: closureDiff,
    diffs,
    note:
      verdict.kind === "rejected"
        ? `The contract rejected the batch: ${verdict.message}`
        : verdict.kind === "executed"
          ? "simulate_intents succeeded for this matched batch. execute_intents was not called."
          : `${input.note} intents.near then reported insufficient balance. A bad signature would say invalid signature instead. execute_intents was not called.`,
    createdAt: new Date().toISOString(),
    fallback: input.fallback,
    fallbackError: input.fallbackError,
    takerFee: formatUsd(priced.fee),
    takerFeeAtoms: priced.fee.toString(),
  };
  const specLot = parseAtoms(PAIRS[input.pair].lot, PAIRS[input.pair].baseDecimals) ?? 1n;
  const decision = executionDecision({
    live: liveRequested(),
    verdict: verdict.kind,
    baseQty,
    lot: specLot,
    quoteQty,
    relayerConfigured: relayerConfigured(),
  });
  if (liveRequested() && !decision.broadcast) {
    if (nonceRejected(verdict.message)) useLegacyNonces();
    fill.status = "FAILED";
    fill.settlement = "rejected";
    fill.note = decision.reason;
    state.fills.push(fill);
    persist();
    return fill;
  }
  if (decision.broadcast) {
    try {
      const tx = await broadcastExecute(batch);
      fill.txHash = tx.txHash;
      fill.status = "SETTLED";
      fill.settlement = "broadcast";
      fill.note = `${decision.reason} Transaction ${tx.txHash}.`;
    } catch (error) {
      fill.status = "FAILED";
      fill.settlement = "rejected";
      fill.note = `Broadcast failed and was not retried. ${error instanceof Error ? error.message : "execute_intents failed"}`;
      state.fills.push(fill);
      persist();
      return fill;
    }
  }
  if (verdict.kind === "rejected") {
    if (nonceRejected(verdict.message)) {
      useLegacyNonces();
      fill.note = `${fill.note} Nonce format was rejected. The next order uses the legacy nonce.`;
    }
    state.fills.push(fill);
    persist();
    return fill;
  }
  for (const order of input.makerOrders) {
    order.status = "FILLED";
    order.qty = "0";
    order.reservedBy = undefined;
    order.reservedUntil = undefined;
  }
  state.fills.push(fill);
  state.history[input.pair].push({ t: Date.now(), mid: Number(fill.price) });
  persist();
  const trade = publicFill(fill);
  emit("fill", { pair: input.pair, trade });
  void import("./webhooks")
    .then((mod) => mod.fanoutFill(trade))
    .catch(() => undefined);
  return fill;
}

function sweepUnlocked() {
  const now = Date.now();
  let changed = false;
  for (const order of memory().orders) {
    if (order.status === "OPEN" && Date.parse(order.deadline) <= now) {
      order.status = "EXPIRED";
      order.reservedBy = undefined;
      order.reservedUntil = undefined;
      changed = true;
    } else if (order.reservedUntil && Date.parse(order.reservedUntil) <= now) {
      order.reservedBy = undefined;
      order.reservedUntil = undefined;
      changed = true;
    }
  }
  for (const [id, preview] of memory().previews) {
    if (Date.parse(preview.expiresAt) <= now) memory().previews.delete(id);
  }
  if (changed) {
    persist();
    emit("book");
  }
}

let bootPromise: Promise<void> | null = null;

export function boot(): Promise<void> {
  if (!bootPromise) bootPromise = bootInner();
  return bootPromise;
}

async function bootInner() {
  const state = memory();
  if (state.started) return;
  state.mm = generateKey();
  state.operator = generateKey();
  load();
  sweepUnlocked();
  try {
    await refreshProtocol();
    const deadline = iso(Date.now() + 10 * 60 * 1000);
    let probe = signEmptyIntent(state.operator.secretKey, state.salt!, deadline);
    state.authProbe = await simulateIntents([probe]);
    const probeVerdict = interpretSimulation(state.authProbe);
    if (probeVerdict.kind === "rejected" && nonceRejected(probeVerdict.message)) {
      useLegacyNonces();
      probe = signEmptyIntent(state.operator.secretKey, state.salt!, deadline);
      state.authProbe = await simulateIntents([probe]);
    }
    state.authAccount = state.operator.accountId;
    await seedUnlocked();
  } catch (error) {
    state.authProbe = { error: error instanceof Error ? error.message : String(error) };
  }
  state.started = true;
  const refreshMs = Number(process.env.MM_INTERVAL_MS || 45000);
  setInterval(() => {
    void lock(async () => {
      try {
        await refreshProtocol();
        await seedUnlocked();
      } catch {
        // Keep the last good book if a price source blips.
      }
    });
  }, refreshMs).unref?.();
  setInterval(() => {
    void lock(async () => sweepUnlocked());
  }, 5000).unref?.();
}

export async function health() {
  await boot();
  const state = memory();
  const verdict = interpretSimulation(state.authProbe);
  return {
    ok: state.feePips != null,
    service: "intentbook",
    dryRun: true,
    liveExecution: liveRequested() ? (relayerConfigured() ? "armed" : "refused") : "off",
    liveNote: liveRequested()
      ? "INTENTBOOK_LIVE=1. execute_intents runs only after simulate_intents succeeds, the order is within 5 lots and 50 USDC, and NEAR_RELAYER_ACCOUNT plus NEAR_RELAYER_PRIVATE_KEY are set."
      : "Dry-run is the default. execute_intents is not called.",
    takerFeeBps: Number(TAKER_FEE_BPS),
    makerFeeBps: Number(MAKER_FEE_BPS),
    sqlite: true,
    contract: process.env.INTENTS_CONTRACT || "intents.near",
    feePips: state.feePips ?? null,
    salt: state.salt ?? null,
    feeCollector: state.feeCollector ?? null,
    mmAccount: state.mm?.accountId ?? null,
    operatorAccount: state.operator?.accountId ?? null,
    authProbe: state.authProbe ?? null,
    authProbeKind: state.authProbe ? verdict.kind : "missing",
    authAccount: state.authAccount ?? null,
    pairs: PAIR_IDS,
    now: new Date().toISOString(),
  };
}

export async function ticker() {
  await boot();
  const state = memory();
  return {
    pairs: PAIR_IDS.map((pair) => {
      const bids = levels(pair, "BUY");
      const asks = levels(pair, "SELL");
      const ref = state.mids[pair];
      return {
        pair,
        mid: ref?.mid ?? null,
        source: ref?.source ?? null,
        rheaMid: ref?.rheaMid ?? null,
        updatedAt: ref?.updatedAt ?? null,
        bestBid: bids[0]?.price ?? null,
        bestAsk: asks[0]?.price ?? null,
        history: state.history[pair],
      };
    }),
  };
}

export async function book(pairRaw: string) {
  await boot();
  const pair = requirePair(pairRaw);
  const bids = levels(pair, "BUY");
  const asks = levels(pair, "SELL");
  const ref = memory().mids[pair];
  const bestBid = bids[0] ? BigInt(bids[0].priceAtoms) : null;
  const bestAsk = asks[0] ? BigInt(asks[0].priceAtoms) : null;
  return {
    pair,
    mid: ref?.mid ?? null,
    source: ref?.source ?? null,
    rheaMid: ref?.rheaMid ?? null,
    bestBid: bids[0]?.price ?? null,
    bestAsk: asks[0]?.price ?? null,
    spread: bestBid != null && bestAsk != null ? formatUsd(bestAsk - bestBid) : null,
    bids,
    asks,
    ts: new Date().toISOString(),
  };
}

export async function trades(pairRaw?: string) {
  await boot();
  const pair = pairRaw ? requirePair(pairRaw) : null;
  const rows = memory().fills.filter((fill) => !pair || fill.pair === pair).slice(-100).reverse();
  return { trades: rows.map(publicFill) };
}

export async function orders(filter: { account?: string; pair?: string; status?: string }) {
  await boot();
  const pair = filter.pair ? requirePair(filter.pair) : null;
  const rows = memory().orders.filter((order) => {
    if (filter.account && order.owner !== filter.account.toLowerCase()) return false;
    if (pair && order.pair !== pair) return false;
    if (filter.status && order.status !== filter.status) return false;
    return true;
  });
  return { orders: rows.slice(-200).reverse().map(publicOrder) };
}

function signingStandard(account: string): SignStandard {
  return accountKind(account) === "evm" ? "erc191" : "nep413";
}

function prepareLeg(input: {
  account: string;
  deadline: string;
  diff: Record<string, string>;
  memo: string;
  salt: string;
  baseQty: bigint;
  quoteQty: bigint;
  fee?: bigint;
  priceAtoms: bigint;
  lotIds?: string[];
  baseDecimals: number;
}): PreparedLeg {
  const nonceBytes = makeNonce(input.salt, Date.parse(input.deadline));
  const nonce = bytesToBase64(nonceBytes);
  const nep413 = tokenDiffMessage({
    signerId: input.account,
    deadline: input.deadline,
    diff: input.diff,
    memo: input.memo,
  });
  const standard = signingStandard(input.account);
  return {
    message: standard === "erc191" ? erc191FromNep413Message(nep413, nonce) : nep413,
    nonce,
    recipient: "intents.near",
    standard,
    baseQty: formatAtoms(input.baseQty, input.baseDecimals, 8),
    quoteQty: formatUsd(input.quoteQty),
    price: formatUsd(input.priceAtoms),
    fee: formatUsd(input.fee ?? 0n),
    deadline: input.deadline,
    lotIds: input.lotIds,
  };
}

export async function preview(input: {
  account: string;
  pair: string;
  side: Side;
  orderType: "LIMIT" | "MARKET";
  qty: string;
  price?: string;
  deadlineSeconds?: number;
  referrer?: string;
}) {
  return lock(() => previewUnlocked(input));
}

async function previewUnlocked(input: {
  account: string;
  pair: string;
  side: Side;
  orderType: "LIMIT" | "MARKET";
  qty: string;
  price?: string;
  deadlineSeconds?: number;
  referrer?: string;
}): Promise<Preview> {
  await boot();
  sweepUnlocked();
  const account = requireBookAccount(input.account);
  const pair = requirePair(input.pair);
  const spec = PAIRS[pair];
  const qty = parseAtoms(input.qty, spec.baseDecimals);
  if (qty == null || qty <= 0n) throw new EngineError(400, "Quantity is not a valid base amount");
  const protocol = requireProtocol();
  const limit = input.orderType === "MARKET" ? null : parsePriceAtoms(input.price ?? "");
  if (input.orderType === "LIMIT" && (limit == null || limit <= 0n)) {
    throw new EngineError(400, "Enter a limit price in USDC per 1 coin");
  }
  const now = Date.now();
  const selected = selectLots(orderLots(pair, now), { side: input.side, limit, qty, now });
  const makerOrders = selected.taken
    .map((lot) => memory().orders.find((order) => order.id === lot.id))
    .filter((order): order is StoredOrder => Boolean(order));
  const warnings: string[] = [];
  let take: PreparedLeg | null = null;
  if (makerOrders.length > 0) {
    const makerDiffs = makerOrders.map((order) => readDiffs(intentMessage(order.signed))[0]?.diff ?? {});
    const priced = takerLeg(makerDiffs, USDC_ASSET, TAKER_FEE_BPS);
    const base = BigInt(priced.taker[spec.baseAsset] ?? "0");
    const baseQty = base < 0n ? -base : base;
    take = prepareLeg({
      account,
      deadline: iso(now + 90_000),
      diff: priced.taker,
      memo: `intentbook:${pair}:${input.side}:TAKE`,
      salt: protocol.salt,
      baseQty,
      quoteQty: priced.quoteAbs,
      fee: priced.fee,
      priceAtoms: priceAtomsFromFill(baseQty, priced.quoteAbs, spec.baseDecimals),
      lotIds: makerOrders.map((order) => order.id),
      baseDecimals: spec.baseDecimals,
    });
    warnings.push("This order crosses the book. You sign the makers' prices, so you keep any price improvement.");
    warnings.push(`Taker fee is ${TAKER_FEE_BPS.toString()} bps (${formatUsd(priced.fee)} USDC). Maker fee is ${MAKER_FEE_BPS.toString()} bps.`);
  }
  let rest: PreparedLeg | null = null;
  const seconds = input.deadlineSeconds ?? 24 * 60 * 60;
  if (input.orderType === "LIMIT" && selected.leftover > 0n && limit != null) {
    if (seconds < 15 || seconds > 24 * 60 * 60) throw new EngineError(400, "Deadline must be between 15 seconds and 24 hours");
    const quote = quoteAtomsForBase(selected.leftover, limit, spec.baseDecimals);
    if (quote <= 0n) throw new EngineError(400, "Order is too small at this price");
    const diff =
      input.side === "BUY"
        ? { [spec.baseAsset]: selected.leftover.toString(), [USDC_ASSET]: (-quote).toString() }
        : { [spec.baseAsset]: (-selected.leftover).toString(), [USDC_ASSET]: quote.toString() };
    rest = prepareLeg({
      account,
      deadline: iso(now + seconds * 1000),
      diff,
      memo: `intentbook:${pair}:${input.side}:${formatUsd(limit)}`,
      salt: protocol.salt,
      baseQty: selected.leftover,
      quoteQty: quote,
      priceAtoms: limit,
      baseDecimals: spec.baseDecimals,
    });
    if (take) warnings.push("Size left over after whole maker lots will rest at your limit. That is a second signature.");
    else warnings.push("Nothing was marketable in whole lots. The order will rest. A signed order does not lock the balance.");
  } else if (input.orderType === "MARKET" && selected.leftover > 0n) {
    warnings.push(routePlan({ taken: makerOrders.length, leftover: selected.leftover, pair }).note);
  }
  if (!take && !rest && input.orderType === "LIMIT") {
    throw new EngineError(400, "Nothing to place");
  }
  let fallback: unknown = null;
  let fallbackError: string | null = null;
  if (input.orderType === "MARKET" && selected.leftover > 0n) {
    const plan = routePlan({ taken: makerOrders.length, leftover: selected.leftover, pair });
    const routed: { plan: ReturnType<typeof routePlan>; oneclick: unknown; rhea: unknown } = {
      plan,
      oneclick: null,
      rhea: null,
    };
    try {
      routed.oneclick = await fallbackQuote({ pair, side: input.side, baseQty: selected.leftover, account });
    } catch (error) {
      fallbackError = error instanceof Error ? error.message : String(error);
    }
    if (plan.rhea) {
      try {
        const tokenIn = input.side === "SELL" ? "wrap.near" : USDC_CONTRACT;
        const tokenOut = input.side === "SELL" ? USDC_CONTRACT : "wrap.near";
        routed.rhea = await rheaSwapQuote(selected.leftover, tokenIn, tokenOut);
      } catch {
        routed.rhea = { error: "Rhea quote failed" };
      }
    }
    fallback = routed;
  }
  const previewId = crypto.randomUUID();
  const expiresAt = iso(now + 60_000);
  const hold = iso(now + 60_000);
  for (const order of makerOrders) {
    order.reservedBy = previewId;
    order.reservedUntil = hold;
  }
  const body: Preview & { reservedIds: string[] } = {
    previewId,
    account,
    pair,
    side: input.side,
    orderType: input.orderType,
    expiresAt,
    take,
    rest,
    fallback,
    fallbackError,
    warnings,
    referrer: input.referrer || undefined,
    reservedIds: makerOrders.map((order) => order.id),
  };
  memory().previews.set(previewId, body);
  return {
    previewId,
    account,
    pair,
    side: input.side,
    orderType: input.orderType,
    expiresAt,
    take,
    rest,
    fallback,
    fallbackError,
    warnings,
    referrer: input.referrer || undefined,
  };
}

function assertLeg(signed: SignedIntent, leg: PreparedLeg, salt: string, account: string) {
  if (intentMessage(signed) !== leg.message) throw new EngineError(400, "Signed payload does not match the preview");
  if (signed.standard === "nep413" && signed.payload.nonce !== leg.nonce) {
    throw new EngineError(400, "Signed payload does not match the preview");
  }
  if (signed.standard !== "nep413") {
    const parsed = JSON.parse(signed.payload) as { nonce?: string };
    if (parsed.nonce !== leg.nonce) throw new EngineError(400, "Signed payload does not match the preview");
  }
  if (!verifyUserSignature(signed, account)) throw new EngineError(400, "Signature did not verify");
  if (saltOf(signed) !== salt) throw new EngineError(400, "Nonce salt is stale. Review the order again.");
  if (hasNonce(account, leg.nonce)) throw new EngineError(409, "That nonce was already cancelled or used here");
  return account;
}

export async function commit(input: { previewId: string; take?: SignedIntent | null; rest?: SignedIntent | null }) {
  return lock(() => commitUnlocked(input));
}

async function commitUnlocked(input: { previewId: string; take?: SignedIntent | null; rest?: SignedIntent | null }) {
  await boot();
  const preview = memory().previews.get(input.previewId);
  if (!preview) throw new EngineError(404, "Preview expired. Review the order again.");
  if (Date.parse(preview.expiresAt) <= Date.now()) {
    release(preview.reservedIds);
    memory().previews.delete(preview.previewId);
    throw new EngineError(409, "Preview expired. Review the order again.");
  }
  const protocol = requireProtocol();
  const created: ReturnType<typeof publicOrder>[] = [];
  let fill: Fill | null = null;
  try {
    if (preview.take) {
      if (!input.take) throw new EngineError(400, "The crossing order still needs a signature");
      const signer = assertLeg(input.take, preview.take, protocol.salt, preview.account);
      if (signer !== preview.account) throw new EngineError(400, "Signer does not match the preview account");
      const used = await nonceUsed(signer, intentNonce(input.take));
      if (used) throw new EngineError(409, "That nonce is already used on intents.near");
      const makers = preview.reservedIds
        .map((id) => memory().orders.find((order) => order.id === id && order.status === "OPEN"))
        .filter((order): order is StoredOrder => Boolean(order));
      if (makers.length !== preview.reservedIds.length) {
        throw new EngineError(409, "A reserved lot left the book. Review the order again.");
      }
      fill = await settleUnlocked({
        pair: preview.pair,
        makerOrders: makers,
        takerSigned: input.take,
        note: "Matched on the public book at the makers' prices.",
        fallback: preview.fallback,
        fallbackError: preview.fallbackError,
      });
      if (fill.settlement === "rejected") {
        release(preview.reservedIds);
        memory().previews.delete(preview.previewId);
        emit("book");
        return { ok: false, error: fill.note, fill: publicFill(fill) };
      }
    }
    if (preview.rest) {
      if (!input.rest) throw new EngineError(400, "The resting order still needs a signature");
      const signer = assertLeg(input.rest, preview.rest, protocol.salt, preview.account);
      if (signer !== preview.account) throw new EngineError(400, "Signer does not match the preview account");
      const spec = PAIRS[preview.pair];
      const signedDiff = readDiffs(intentMessage(input.rest))[0]?.diff ?? {};
      const baseSigned = signedDiff[spec.baseAsset] ?? 0n;
      const quoteSigned = signedDiff[USDC_ASSET] ?? 0n;
      const qty = baseSigned < 0n ? -baseSigned : baseSigned;
      const quote = quoteSigned < 0n ? -quoteSigned : quoteSigned;
      const price = priceAtomsFromFill(qty, quote, spec.baseDecimals);
      if (qty <= 0n || quote <= 0n) throw new EngineError(400, "Resting diff was empty");
      const order: StoredOrder = {
        id: crypto.randomUUID(),
        pair: preview.pair,
        side: preview.side,
        price: formatUsd(price),
        priceAtoms: price.toString(),
        qty: qty.toString(),
        originalQty: qty.toString(),
        quoteQty: quote.toString(),
        owner: preview.account,
        role: "user",
        signed: input.rest,
        nonce: intentNonce(input.rest),
        deadline: preview.rest.deadline,
        createdAt: new Date().toISOString(),
        status: "OPEN",
        memo: `intentbook:${preview.pair}:${preview.side}:${preview.rest.price}`,
      };
      memory().orders.push(order);
      created.push(publicOrder(order));
    }
  } catch (error) {
    release(preview.reservedIds);
    memory().previews.delete(preview.previewId);
    throw error;
  }
  memory().previews.delete(preview.previewId);
  const fillsBefore = memory().fills.length;
  if (created.length > 0) await backstopUnlocked();
  const backstopFills = memory().fills.slice(fillsBefore);
  const fills = [fill, ...backstopFills].filter((item): item is Fill => Boolean(item));
  const ordersNow = created.map((row) => {
    const fresh = memory().orders.find((order) => order.id === row.id);
    return fresh ? publicOrder(fresh) : row;
  });
  if (preview.take && fill && fill.settlement !== "rejected") {
    rememberNonce(preview.account, preview.take.nonce);
    const shareBps = BigInt(process.env.REFERRER_SHARE_BPS || "5000");
    const feeAtoms = BigInt(fill.takerFeeAtoms || "0");
    if (preview.referrer && feeAtoms > 0n) {
      const share = (feeAtoms * shareBps) / 10_000n;
      bookStore().creditReferrer({
        id: `${fill.id}:${preview.referrer}`,
        referrer: preview.referrer,
        fillId: fill.id,
        feeAtoms: feeAtoms.toString(),
        shareAtoms: share.toString(),
      });
    }
  }
  if (preview.rest) rememberNonce(preview.account, preview.rest.nonce);
  persist();
  emit("book");
  const shown = fills.find((item) => item.settlement !== "rejected") ?? fills[0] ?? null;
  const decision = executionDecision({
    live: liveRequested(),
    verdict: "executed",
    baseQty: 1n,
    lot: 1n,
    quoteQty: 1n,
    relayerConfigured: relayerConfigured(),
  });
  return {
    ok: true,
    liveExecution: liveRequested() ? (relayerConfigured() ? "armed" : "refused") : "off",
    liveNote: decision.broadcast
      ? "Live mode is armed. A match broadcasts only after simulate_intents succeeds and the size cap passes."
      : decision.reason,
    orders: ordersNow,
    fill: shown ? publicFill(shown) : null,
    fills: fills.map(publicFill),
  };
}

export async function cancel(input: { id: string; account: string }) {
  return lock(async () => {
    await boot();
    const account = input.account.toLowerCase();
    const order = memory().orders.find((item) => item.id === input.id);
    if (!order || order.owner !== account) throw new EngineError(404, "Order not found for this account");
    if (order.status !== "OPEN") throw new EngineError(409, `Order is ${order.status}`);
    order.status = "CANCELLED";
    order.reservedBy = undefined;
    order.reservedUntil = undefined;
    rememberNonce(order.owner, order.nonce);
    persist();
    emit("book");
    return { ok: true, order: publicOrder(order), onChain: ONCHAIN_CANCEL_NOTE };
  });
}

export async function balances(accountRaw: string) {
  await boot();
  const account = requireBookAccount(accountRaw);
  const tokenIds = [USDC_ASSET, ...Object.values(PAIRS).map((pair) => pair.baseAsset)];
  const values = await batchBalances(account, tokenIds);
  if (!values) throw new EngineError(502, "Balance query failed");
  return {
    account,
    explorer: `https://nearblocks.io/address/${account}`,
    balances: tokenIds.map((tokenId, index) => ({
      tokenId,
      amount: values[index] ?? "0",
    })),
  };
}

export async function quoteDeposit(input: {
  amount: string;
  account: string;
  refundTo: string;
  dry?: boolean;
  originAsset?: string;
}) {
  await boot();
  const account = requireBookAccount(input.account);
  if (!isEvmAddress(input.refundTo)) throw new EngineError(400, "Refund address must be an 0x EVM address");
  const dry = input.dry !== false;
  try {
    const quote = await depositQuote({
      usdcAmount: input.amount,
      intentsAccount: account,
      refundTo: input.refundTo,
      dry,
      originAsset: input.originAsset,
    });
    return { ok: true, dry, quote };
  } catch (error) {
    throw new EngineError(502, error instanceof Error ? error.message : "Quote failed");
  }
}

export async function trackDeposit(depositAddress: string) {
  await boot();
  if (!depositAddress || depositAddress.length < 8 || depositAddress.length > 200) {
    throw new EngineError(400, "Enter a deposit address");
  }
  return { result: await depositStatus(depositAddress) };
}

export async function quoteFallback(input: { pair: string; side: Side; qty: string; account: string }) {
  await boot();
  const pair = requirePair(input.pair);
  const account = requireBookAccount(input.account);
  const qty = parseAtoms(input.qty, PAIRS[pair].baseDecimals);
  if (qty == null || qty <= 0n) throw new EngineError(400, "Quantity is not valid");
  try {
    const quote = await fallbackQuote({ pair, side: input.side, baseQty: qty, account });
    return { ok: true, dry: true, quote };
  } catch (error) {
    throw new EngineError(502, error instanceof Error ? error.message : "Quote failed");
  }
}

export async function nearDepositTemplate(input: { tokenContract: string; amount: string; owner?: string }) {
  await boot();
  return nearDepositCall(input);
}

export async function withdrawPreview(input: {
  account: string;
  tokenId: string;
  receiverId: string;
  amount: string;
  chain: "near" | "other";
  destinationAsset?: string;
  dry?: boolean;
}) {
  await boot();
  const account = requireBookAccount(input.account);
  const protocol = requireProtocol();
  const deadline = iso(Date.now() + 10 * 60 * 1000);
  const intent = withdrawIntent({
    tokenId: input.tokenId,
    receiverId: input.receiverId,
    amount: input.amount,
    memo: "intentbook:withdraw",
  });
  const nep413 = JSON.stringify({ signer_id: account, deadline, intents: [intent] });
  const nonce = bytesToBase64(makeNonce(protocol.salt));
  const standard = signingStandard(account);
  let quote: unknown = null;
  let quoteError: string | null = null;
  if (input.chain === "other") {
    try {
      quote = await withdrawQuote({
        usdcAmount: formatAtoms(BigInt(input.amount), 6, 6),
        intentsAccount: account,
        destinationAsset: input.destinationAsset || input.tokenId,
        recipient: input.receiverId,
        dry: input.dry !== false,
      });
    } catch (error) {
      quoteError = error instanceof Error ? error.message : "Withdraw quote failed";
    }
  }
  return {
    account,
    standard,
    nonce,
    message: standard === "erc191" ? erc191FromNep413Message(nep413, nonce) : nep413,
    intent,
    quote,
    quoteError,
    note: "Signing this withdraw does not broadcast it. Submit it to simulate, and live mode broadcasts only after the safety checks pass.",
  };
}

export async function withdrawSubmit(input: { account: string; signed: SignedIntent }) {
  await boot();
  const account = requireBookAccount(input.account);
  if (!verifyUserSignature(input.signed, account)) throw new EngineError(400, "Signature did not verify");
  const protocol = requireProtocol();
  if (saltOf(input.signed) !== protocol.salt) throw new EngineError(400, "Nonce salt is stale");
  const simulate = await simulateIntents([input.signed]);
  const verdict = interpretSimulation(simulate);
  const decision = executionDecision({
    live: liveRequested(),
    verdict: verdict.kind,
    baseQty: 1n,
    lot: 1n,
    quoteQty: 1n,
    relayerConfigured: relayerConfigured(),
  });
  if (!decision.broadcast) {
    return { ok: verdict.kind !== "rejected", broadcast: false, verdict: verdict.kind, simulate, note: decision.reason };
  }
  const tx = await broadcastExecute([input.signed]);
  rememberNonce(account, intentNonce(input.signed));
  return { ok: true, broadcast: true, txHash: tx.txHash, explorer: `https://nearblocks.io/txns/${tx.txHash}`, simulate };
}

export async function burnPreview(input: { id: string; account: string }) {
  await boot();
  const account = requireBookAccount(input.account);
  const order = memory().orders.find((item) => item.id === input.id && sameAccount(item.owner, account));
  if (!order) throw new EngineError(404, "Order not found for this account");
  const deadline = iso(Date.now() + 10 * 60 * 1000);
  const nep413 = emptyIntentMessage(account, deadline);
  const standard = signingStandard(account);
  return {
    id: order.id,
    nonce: order.nonce,
    standard,
    message: standard === "erc191" ? erc191FromNep413Message(nep413, order.nonce) : nep413,
    note: ONCHAIN_CANCEL_NOTE,
  };
}

export async function burnSubmit(input: { id: string; account: string; signed: SignedIntent }) {
  await boot();
  const preview = await burnPreview({ id: input.id, account: input.account });
  if (intentMessage(input.signed) !== preview.message) throw new EngineError(400, "Burn signature does not match this order nonce");
  if (!verifyUserSignature(input.signed, requireBookAccount(input.account))) throw new EngineError(400, "Signature did not verify");
  const simulate = await simulateIntents([input.signed]);
  const verdict = interpretSimulation(simulate);
  const decision = executionDecision({
    live: liveRequested(),
    verdict: verdict.kind,
    baseQty: 1n,
    lot: 1n,
    quoteQty: 0n,
    relayerConfigured: relayerConfigured(),
  });
  if (!decision.broadcast) {
    return { ok: false, broadcast: false, verdict: verdict.kind, simulate, note: `${decision.reason} ${ONCHAIN_CANCEL_NOTE}` };
  }
  const tx = await broadcastExecute([input.signed]);
  rememberNonce(requireBookAccount(input.account), preview.nonce);
  return { ok: true, broadcast: true, txHash: tx.txHash, explorer: `https://nearblocks.io/txns/${tx.txHash}` };
}

export async function priceCompare(input: { pair: string; side: Side; qty: string; account?: string }) {
  await boot();
  const pair = requirePair(input.pair);
  const spec = PAIRS[pair];
  const qty = parseAtoms(input.qty, spec.baseDecimals);
  if (qty == null || qty <= 0n) throw new EngineError(400, "Quantity is not valid");
  const side: Side = input.side === "SELL" ? "SELL" : "BUY";
  const ladder = levels(pair, side === "BUY" ? "SELL" : "BUY");
  const walked = walkBook({
    side,
    qty,
    levels: ladder.map((level) => ({ priceAtoms: BigInt(level.priceAtoms), qtyAtoms: BigInt(level.qtyAtoms) })),
    baseDecimals: spec.baseDecimals,
    takerFeeBps: TAKER_FEE_BPS,
  });
  const schedule = activeFeeSchedule();
  const account = input.account && accountKind(input.account) !== "invalid" ? requireBookAccount(input.account) : "0".repeat(64);
  let oneclick: unknown = null;
  let oneclickError: string | null = null;
  try {
    oneclick = await fallbackQuote({ pair, side, baseQty: qty, account });
  } catch (error) {
    oneclickError = error instanceof Error ? error.message : "1Click quote failed";
  }
  const amounts = readQuoteAmounts(oneclick);
  const other = side === "BUY" ? amounts.amountIn : amounts.amountOut;
  const edge = priceEdge({ side, bookQuote: walked.total, otherQuote: other });
  return {
    pair,
    side,
    qty: input.qty,
    book: {
      filled: formatAtoms(walked.filled, spec.baseDecimals, 8),
      unfilled: formatAtoms(walked.unfilled, spec.baseDecimals, 8),
      quote: formatUsd(walked.quote),
      fee: formatUsd(walked.fee),
      total: formatUsd(walked.total),
      totalAtoms: walked.total.toString(),
    },
    oneclick: {
      total: other > 0n ? formatUsd(other) : null,
      totalAtoms: other.toString(),
      amountInFormatted: amounts.amountInFormatted,
      amountOutFormatted: amounts.amountOutFormatted,
      error: oneclickError,
    },
    savings: {
      quote: formatUsd(edge.delta < 0n ? -edge.delta : edge.delta),
      quoteAtoms: edge.delta.toString(),
      bps: edge.bps.toString(),
      bookBetter: edge.bookBetter,
      label: edge.bookBetter ? "IntentBook book price is better" : other > 0n ? "1Click price is better" : "1Click quote is not available",
    },
    fees: schedule,
  };
}

export async function candles(pairRaw: string, intervalRaw: string) {
  await boot();
  const pair = requirePair(pairRaw);
  const interval = (intervalRaw in CANDLE_INTERVALS ? intervalRaw : "1m") as CandleInterval;
  const state = memory();
  const points = [
    ...state.history[pair].map((point) => ({ t: point.t, price: point.mid, qty: 0 })),
    ...state.fills
      .filter((fill) => fill.pair === pair)
      .map((fill) => ({ t: Date.parse(fill.createdAt), price: Number(fill.price), qty: Number(fill.baseQty) })),
  ];
  return { pair, interval, candles: buildCandles(points, CANDLE_INTERVALS[interval]) };
}

export async function depth(pairRaw: string, groupRaw: string) {
  await boot();
  const pair = requirePair(pairRaw);
  const groupUsd = Number(groupRaw || "0");
  const groupAtoms = Number.isFinite(groupUsd) && groupUsd > 0 ? BigInt(Math.round(groupUsd * 1_000_000)) : 0n;
  const bids = groupDepth(
    levels(pair, "BUY").map((level) => ({ priceAtoms: BigInt(level.priceAtoms), qtyAtoms: BigInt(level.qtyAtoms) })),
    groupAtoms,
  ).sort((a, b) => (BigInt(a.priceAtoms) > BigInt(b.priceAtoms) ? -1 : 1));
  const asks = groupDepth(
    levels(pair, "SELL").map((level) => ({ priceAtoms: BigInt(level.priceAtoms), qtyAtoms: BigInt(level.qtyAtoms) })),
    groupAtoms,
  ).sort((a, b) => (BigInt(a.priceAtoms) < BigInt(b.priceAtoms) ? -1 : 1));
  return { pair, group: groupRaw || "0", bids, asks };
}

export async function bestQuote(input: { pair: string; side: Side; qty: string; account?: string }) {
  const compared = await priceCompare(input);
  const pair = requirePair(input.pair);
  let rheaAtoms = 0n;
  let rhea: unknown = null;
  if (pair === "NEAR-USDC") {
    const spec = PAIRS[pair];
    const qty = parseAtoms(input.qty, spec.baseDecimals);
    if (qty) {
      rhea = await rheaSwapQuote(qty, input.side === "SELL" ? "wrap.near" : USDC_CONTRACT, input.side === "SELL" ? USDC_CONTRACT : "wrap.near");
      const data = rhea as { result_data?: { amount_out?: string } } | null;
      if (data?.result_data?.amount_out) rheaAtoms = BigInt(data.result_data.amount_out);
    }
  }
  const legs = [
    { venue: "book", quoteAtoms: compared.book.totalAtoms, ok: compared.book.unfilled === "0" || compared.book.totalAtoms !== "0" },
    { venue: "1click", quoteAtoms: compared.oneclick.totalAtoms, ok: !compared.oneclick.error && compared.oneclick.totalAtoms !== "0" },
    { venue: "rhea", quoteAtoms: rheaAtoms.toString(), ok: rheaAtoms > 0n },
  ];
  const winner = pickWinner(
    input.side,
    legs.map((leg) => ({ venue: leg.venue, quoteAtoms: BigInt(leg.quoteAtoms || "0"), ok: leg.ok })),
  );
  return { ...compared, rhea, legs, winner };
}

export async function signedCancel(input: { signed: SignedIntent }) {
  await boot();
  const message = intentMessage(input.signed);
  const parsed = JSON.parse(message) as { signer_id?: string; intents?: { intent?: string; order_id?: string }[] };
  const orderId = parsed.intents?.find((intent) => intent.intent === "cancel")?.order_id;
  const signer = parsed.signer_id || intentSigner(input.signed);
  if (!orderId) throw new EngineError(400, "Cancel intent needs order_id");
  if (!verifyUserSignature(input.signed, signer)) throw new EngineError(400, "Signature did not verify");
  return cancel({ id: orderId, account: signer });
}

export async function accountSummary(accountRaw: string) {
  await boot();
  const account = requireBookAccount(accountRaw);
  const orderRows = await orders({ account });
  const tradeRows = await trades();
  const fills = tradeRows.trades.filter((trade) => trade.takerAccount === account || trade.makerAccounts.includes(account));
  const balanceRows = await balances(account);
  return { account, orders: orderRows.orders, fills, balances: balanceRows.balances, explorer: balanceRows.explorer };
}

export async function registerWebhook(input: { account: string; url: string; signed: SignedIntent }) {
  await boot();
  const account = requireBookAccount(input.account);
  if (!verifyUserSignature(input.signed, account)) throw new EngineError(400, "Signature did not verify");
  const message = intentMessage(input.signed);
  if (!message.includes(input.url)) throw new EngineError(400, "Signed message must include the webhook URL");
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new EngineError(400, "Webhook URL is invalid");
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new EngineError(400, "Webhook URL must be https, or localhost for tests");
  }
  const secret = newWebhookSecret();
  const id = crypto.randomUUID();
  bookStore().saveWebhook({ id, account, url: input.url, secret });
  return { id, account, url: input.url, secret, note: "Store this secret. It signs X-IntentBook-Signature and is not shown again." };
}

export async function keyStatus(accountRaw: string, publicKey: string) {
  await boot();
  const account = requireBookAccount(accountRaw);
  if (!publicKey.startsWith("ed25519:")) throw new EngineError(400, "Public key must be ed25519:");
  const registered = await hasPublicKey(account, publicKey);
  return {
    account,
    publicKey,
    registered,
    call: {
      receiverId: "intents.near",
      methodName: "add_public_key",
      args: { public_key: publicKey },
      gas: "30000000000000",
      deposit: "1",
      note: "The user's NEAR wallet signs this. The server does not send it. Named accounts need this before live execute_intents.",
    },
  };
}

export async function referrerStats(referrer: string) {
  await boot();
  if (!referrer || referrer.length > 80) throw new EngineError(400, "Referrer id is missing");
  return { referrer, shareBps: process.env.REFERRER_SHARE_BPS || "5000", ...bookStore().referrerTotal(referrer) };
}
