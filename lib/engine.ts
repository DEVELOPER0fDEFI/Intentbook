import fs from "node:fs";
import path from "node:path";
import { PAIRS, USDC_ASSET } from "./assets";
import { closureForDeltas } from "./closure";
import {
  formatAtoms,
  formatUsd,
  isEvmAddress,
  isImplicitAccount,
  parseAtoms,
  parsePriceAtoms,
  priceAtomsFromFill,
  quoteAtomsForBase,
} from "./format";
import { selectLots } from "./matcher";
import {
  generateKey,
  nonceSaltHex,
  readDiffs,
  signEmptyIntent,
  signTokenDiff,
  sortedDiff,
  tokenDiffMessage,
  verifySigned,
  bytesToBase64,
  makeNonce,
  type DemoKey,
} from "./nep413";
import { depositQuote, depositStatus, fallbackQuote, referencePrices, type ReferencePrice } from "./quotes";
import type { Fill, PairId, PreparedLeg, Preview, Side, SignedNep413, StoredOrder } from "./types";
import { PAIR_IDS } from "./types";
import {
  batchBalances,
  interpretSimulation,
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
  listeners: Set<(event: { type: string; ts: number }) => void>;
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
  const payload = {
    orders: state.orders.filter((order) => order.role === "user"),
    fills: state.fills.slice(-200),
  };
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(payload));
}

function load() {
  const state = memory();
  if (!fs.existsSync(DATA_PATH)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as {
      orders?: StoredOrder[];
      fills?: Fill[];
    };
    state.orders.push(...(parsed.orders ?? []).filter((order) => order.role === "user"));
    state.fills.push(...(parsed.fills ?? []));
  } catch {
    // Ignore a corrupt local file and start empty.
  }
}

function emit(type: string) {
  const event = { type, ts: Date.now() };
  for (const listener of memory().listeners) listener(event);
}

export function subscribe(listener: (event: { type: string; ts: number }) => void): () => void {
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

function sumDiffs(diffs: Record<string, bigint>[]): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  for (const diff of diffs) {
    for (const [token, amount] of Object.entries(diff)) out[token] = (out[token] ?? 0n) + amount;
  }
  return out;
}

function opposite(diff: Record<string, bigint>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [token, amount] of Object.entries(diff)) {
    if (amount !== 0n) out[token] = (-amount).toString();
  }
  return sortedDiff(out);
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
    explorer: "https://nearblocks.io/address/intents.near",
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
  takerSigned?: SignedNep413;
  note: string;
  fallback: unknown | null;
  fallbackError: string | null;
}): Promise<Fill> {
  const state = memory();
  const protocol = requireProtocol();
  const makerDiffs = input.makerOrders.map((order) => readDiffs(order.signed.payload.message)[0]?.diff ?? {});
  const combined = sumDiffs(makerDiffs);
  if (!input.takerSigned && !input.takerKey) throw new EngineError(500, "Missing taker signature");
  const takerSigned =
    input.takerSigned ??
    signTokenDiff({
      secretKey: input.takerKey!.secretKey,
      deadline: iso(Date.now() + 90_000),
      diff: opposite(combined),
      memo: `intentbook:${input.pair}:TAKE`,
      saltHex: protocol.salt,
    });
  if (!verifySigned(takerSigned)) throw new EngineError(400, "Taker signature was rejected locally");
  const takerDiff = readDiffs(takerSigned.payload.message)[0]?.diff ?? {};
  const takerAccount = JSON.parse(takerSigned.payload.message).signer_id as string;
  const deltas: [string, bigint][] = [];
  const diffs: Fill["diffs"] = [];
  for (const order of input.makerOrders) {
    const diff = readDiffs(order.signed.payload.message)[0]?.diff ?? {};
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
  const closure = closureForDeltas(deltas, BigInt(protocol.feePips));
  const closureDiff = Object.fromEntries([...closure.entries()].map(([token, amount]) => [token, amount.toString()]));
  const batch: SignedNep413[] = input.makerOrders.map((order) => order.signed);
  batch.push(takerSigned);
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
  };
  if (verdict.kind === "rejected") {
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
  emit("fill");
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
    const probe = signEmptyIntent(state.operator.secretKey, state.salt!, deadline);
    state.authProbe = await simulateIntents([probe]);
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
    liveExecution: process.env.INTENTBOOK_LIVE === "1" ? "refused" : "off",
    liveNote:
      "This build never calls execute_intents. INTENTBOOK_LIVE is recognized and still refused, so a flag cannot spend funds.",
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

function prepareLeg(input: {
  account: string;
  deadline: string;
  diff: Record<string, string>;
  memo: string;
  salt: string;
  baseQty: bigint;
  quoteQty: bigint;
  priceAtoms: bigint;
  lotIds?: string[];
  baseDecimals: number;
}): PreparedLeg {
  const nonce = makeNonce(input.salt);
  return {
    message: tokenDiffMessage({
      signerId: input.account,
      deadline: input.deadline,
      diff: input.diff,
      memo: input.memo,
    }),
    nonce: bytesToBase64(nonce),
    recipient: "intents.near",
    baseQty: formatAtoms(input.baseQty, input.baseDecimals, 8),
    quoteQty: formatUsd(input.quoteQty),
    price: formatUsd(input.priceAtoms),
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
}): Promise<Preview> {
  await boot();
  sweepUnlocked();
  const account = input.account.toLowerCase();
  if (!isImplicitAccount(account)) throw new EngineError(400, "Account must be a 64-character implicit account id");
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
    const makerDiffs = makerOrders.map((order) => readDiffs(order.signed.payload.message)[0]?.diff ?? {});
    const takerDiff = opposite(sumDiffs(makerDiffs));
    const base = BigInt(takerDiff[spec.baseAsset] ?? "0");
    const quote = BigInt(takerDiff[USDC_ASSET] ?? "0");
    const baseQty = base < 0n ? -base : base;
    const quoteQty = quote < 0n ? -quote : quote;
    take = prepareLeg({
      account,
      deadline: iso(now + 90_000),
      diff: takerDiff,
      memo: `intentbook:${pair}:${input.side}:TAKE`,
      salt: protocol.salt,
      baseQty,
      quoteQty,
      priceAtoms: priceAtomsFromFill(baseQty, quoteQty, spec.baseDecimals),
      lotIds: makerOrders.map((order) => order.id),
      baseDecimals: spec.baseDecimals,
    });
    warnings.push("This order crosses the book. You sign the makers' prices, so you keep any price improvement.");
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
    warnings.push("The book could not take the full size in whole lots. The remainder is quoted on 1Click and is not executed.");
  }
  if (!take && !rest && input.orderType === "LIMIT") {
    throw new EngineError(400, "Nothing to place");
  }
  let fallback: unknown = null;
  let fallbackError: string | null = null;
  if (input.orderType === "MARKET" && selected.leftover > 0n) {
    try {
      fallback = await fallbackQuote({ pair, side: input.side, baseQty: selected.leftover, account });
    } catch (error) {
      fallbackError = error instanceof Error ? error.message : String(error);
    }
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
  };
}

function assertLeg(signed: SignedNep413, leg: PreparedLeg, salt: string) {
  if (!verifySigned(signed)) throw new EngineError(400, "Signature did not verify");
  if (signed.payload.message !== leg.message || signed.payload.nonce !== leg.nonce) {
    throw new EngineError(400, "Signed payload does not match the preview");
  }
  if (nonceSaltHex(signed.payload.nonce) !== salt) {
    throw new EngineError(400, "Nonce salt is stale. Review the order again.");
  }
  const signer = JSON.parse(signed.payload.message).signer_id as string;
  return signer;
}

export async function commit(input: { previewId: string; take?: SignedNep413 | null; rest?: SignedNep413 | null }) {
  return lock(() => commitUnlocked(input));
}

async function commitUnlocked(input: { previewId: string; take?: SignedNep413 | null; rest?: SignedNep413 | null }) {
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
      const signer = assertLeg(input.take, preview.take, protocol.salt);
      if (signer !== preview.account) throw new EngineError(400, "Signer does not match the preview account");
      const used = await nonceUsed(signer, input.take.payload.nonce);
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
      const signer = assertLeg(input.rest, preview.rest, protocol.salt);
      if (signer !== preview.account) throw new EngineError(400, "Signer does not match the preview account");
      const spec = PAIRS[preview.pair];
      const signedDiff = readDiffs(input.rest.payload.message)[0]?.diff ?? {};
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
        nonce: input.rest.payload.nonce,
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
  persist();
  emit("book");
  const shown = fills.find((item) => item.settlement !== "rejected") ?? fills[0] ?? null;
  return {
    ok: true,
    liveExecution: process.env.INTENTBOOK_LIVE === "1" ? "refused" : "off",
    liveNote:
      process.env.INTENTBOOK_LIVE === "1"
        ? "INTENTBOOK_LIVE is set, and this build still refuses to broadcast. No execute_intents call was made."
        : "Dry-run. No execute_intents call was made.",
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
    persist();
    emit("book");
    return { ok: true, order: publicOrder(order) };
  });
}

export async function balances(accountRaw: string) {
  await boot();
  const account = accountRaw.toLowerCase();
  if (!isImplicitAccount(account)) throw new EngineError(400, "Account must be a 64-character implicit account id");
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

export async function quoteDeposit(input: { amount: string; account: string; refundTo: string }) {
  await boot();
  const account = input.account.toLowerCase();
  if (!isImplicitAccount(account)) throw new EngineError(400, "Account must be a 64-character implicit account id");
  if (!isEvmAddress(input.refundTo)) throw new EngineError(400, "Refund address must be an 0x EVM address");
  try {
    const quote = await depositQuote({ usdcAmount: input.amount, intentsAccount: account, refundTo: input.refundTo });
    return { ok: true, dry: true, quote };
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
  const account = input.account.toLowerCase();
  if (!isImplicitAccount(account)) throw new EngineError(400, "Account must be a 64-character implicit account id");
  const qty = parseAtoms(input.qty, PAIRS[pair].baseDecimals);
  if (qty == null || qty <= 0n) throw new EngineError(400, "Quantity is not valid");
  try {
    const quote = await fallbackQuote({ pair, side: input.side, baseQty: qty, account });
    return { ok: true, dry: true, quote };
  } catch (error) {
    throw new EngineError(502, error instanceof Error ? error.message : "Quote failed");
  }
}
