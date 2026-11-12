// End-to-end checks of the engine and API route with NEAR RPC and 1Click stubbed.
// Each test replays one of the holes found in review and asserts it is closed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { before } from "node:test";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { generateKey, signExisting, type DemoKey } from "../lib/nep413";
import type { SignedIntent } from "../lib/types";

type Engine = typeof import("../lib/engine");
type Route = typeof import("../app/api/v1/[...path]/route");

let engine: Engine;
let route: Route;
const fullAccess = new Set<string>();
const operatorKey = generateKey();

function rpcResult(value: unknown) {
  return { jsonrpc: "2.0", id: 1, result: { result: [...Buffer.from(JSON.stringify(value))] } };
}

function rpcPanic(message: string) {
  return { jsonrpc: "2.0", id: 1, result: { error: `wasm execution failed with error: HostError(GuestPanic { panic_msg: "${message}" })` } };
}

function stubFetch(): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.endsWith("/v0/tokens")) {
      return json([
        { assetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", price: 1, priceUpdatedAt: "now" },
        { assetId: "nep141:btc.omft.near", price: 72000, priceUpdatedAt: "now" },
        { assetId: "nep141:eth.omft.near", price: 2000, priceUpdatedAt: "now" },
        { assetId: "nep141:sol.omft.near", price: 81, priceUpdatedAt: "now" },
        { assetId: "nep141:wrap.near", price: 3.38, priceUpdatedAt: "now" },
      ]);
    }
    if (!init?.body || typeof init.body !== "string" || !init.body.includes('"jsonrpc"')) {
      return json({ error: "not stubbed" }, 503);
    }
    const params = JSON.parse(init.body).params as {
      request_type: string;
      method_name?: string;
      args_base64?: string;
      account_id?: string;
      public_key?: string;
    };
    if (params.request_type === "view_access_key") {
      return fullAccess.has(`${params.account_id}|${params.public_key}`)
        ? json({ jsonrpc: "2.0", id: 1, result: { nonce: 1, permission: "FullAccess" } })
        : json({ jsonrpc: "2.0", id: 1, result: { error: "access key does not exist while viewing" } });
    }
    const args = JSON.parse(Buffer.from(params.args_base64 ?? "", "base64").toString() || "{}");
    switch (params.method_name) {
      case "fee":
        return json(rpcResult(1));
      case "current_salt":
        return json(rpcResult("252812b3"));
      case "fee_collector":
        return json(rpcResult("collector.near"));
      case "is_nonce_used":
      case "has_public_key":
        return json(rpcResult(false));
      case "mt_batch_balance_of":
        return json(rpcResult((args.token_ids as string[]).map(() => "0")));
      case "simulate_intents": {
        const signed = args.signed as { payload: { message?: string } | string }[];
        const empty = signed.every((item) => {
          const message = typeof item.payload === "string" ? item.payload : item.payload.message ?? "";
          return (JSON.parse(message).intents ?? []).length === 0;
        });
        return json(empty ? rpcResult({ intents_executed: [{ intent_hash: "h" }] }) : rpcPanic("insufficient balance or overflow"));
      }
      default:
        return json(rpcPanic(`unknown method ${params.method_name}`));
    }
  }) as typeof fetch;
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intentbook-test-"));
  process.chdir(dir);
  process.env.SQLITE_PATH = path.join(dir, "book.sqlite");
  process.env.INTENTBOOK_OPERATOR_SECRET = Buffer.from(operatorKey.secretKey).toString("hex");
  delete process.env.INTENTBOOK_MM_SECRET;
  delete process.env.INTENTBOOK_LIVE;
  globalThis.fetch = stubFetch();
  engine = await import("../lib/engine");
  route = await import("../app/api/v1/[...path]/route");
  await engine.boot();
});

async function api(pathName: string, body: unknown) {
  const res = await route.POST(
    new Request(`http://127.0.0.1/api/v1/${pathName}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: pathName.split("/") }) },
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- API responses are loose JSON in tests
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

function signNep413(key: DemoKey, leg: { message: string; nonce: string }): SignedIntent {
  return signExisting({ secretKey: key.secretKey, message: leg.message, nonceBase64: leg.nonce });
}

function signRaw(key: DemoKey, message: string): SignedIntent {
  const signature = ed25519.sign(new TextEncoder().encode(message), key.secretKey);
  return {
    standard: "raw_ed25519",
    payload: message,
    public_key: `ed25519:${bs58.encode(key.publicKey)}`,
    signature: `ed25519:${bs58.encode(signature)}`,
  };
}

/** Places a resting BTC bid far below the market and returns the order id. */
async function restBid(account: string, sign: (leg: { message: string; nonce: string }) => SignedIntent) {
  const draft = await api("orders/preview", { account, pair: "BTC-USDC", side: "BUY", orderType: "LIMIT", qty: "0.0001", price: "1000" });
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  const placed = await api("orders", { previewId: draft.body.previewId, rest: sign(draft.body.rest) });
  return placed;
}

test("health reports the env operator key and dry-run", async () => {
  const health = await engine.health();
  assert.equal(health.dryRun, true);
  assert.deepEqual(health.keySource, { operator: "env", mm: "ephemeral" });
  assert.equal(health.operatorAccount, operatorKey.accountId);
});

test("cancel without a signature is refused", async () => {
  const owner = generateKey();
  const placed = await restBid(owner.accountId, (leg) => signNep413(owner, leg));
  assert.equal(placed.status, 200);
  const id = placed.body.orders[0].id as string;
  const unsigned = await api("orders/cancel", { id, account: owner.accountId });
  assert.equal(unsigned.status, 400);
  const order = (await engine.orders({ account: owner.accountId })).orders.find((row) => row.id === id);
  assert.equal(order?.status, "OPEN");
});

test("the owner's signed cancel works, and nobody else's does", async () => {
  const owner = generateKey();
  const stranger = generateKey();
  const placed = await restBid(owner.accountId, (leg) => signNep413(owner, leg));
  const id = placed.body.orders[0].id as string;

  const forged = await api("orders/cancel-preview", { id, account: owner.accountId });
  assert.equal(forged.status, 200);
  const strangerSig = await api("orders/cancel", { signed: signNep413(stranger, forged.body as never) });
  assert.equal(strangerSig.status, 400);

  const strangerDraft = await api("orders/cancel-preview", { id, account: stranger.accountId });
  assert.equal(strangerDraft.status, 404);

  const draft = await api("orders/cancel-preview", { id, account: owner.accountId });
  const done = await api("orders/cancel", { signed: signNep413(owner, draft.body as never) });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.order.status, "CANCELLED");
});

test("a named NEAR account needs a key it actually owns", async () => {
  const attacker = generateKey();
  const spoofed = await restBid("victim-test.near", (leg) => signNep413(attacker, leg));
  assert.equal(spoofed.status, 403);
  assert.match(String(spoofed.body.error), /not a full-access key/);

  const owner = generateKey();
  fullAccess.add(`owner-test.near|ed25519:${bs58.encode(owner.publicKey)}`);
  const real = await restBid("owner-test.near", (leg) => signNep413(owner, leg));
  assert.equal(real.status, 200, JSON.stringify(real.body));
  assert.equal(real.body.orders[0].owner, "owner-test.near");
});

test("junk webauthn signatures are rejected", async () => {
  const evm = "0x1111111111111111111111111111111111111111";
  const draft = await api("orders/preview", { account: evm, pair: "ETH-USDC", side: "BUY", orderType: "LIMIT", qty: "0.002", price: "100" });
  assert.equal(draft.status, 200);
  const junk = { standard: "webauthn", payload: draft.body.rest.message, public_key: "x", signature: "x", client_data_json: "x", authenticator_data: "x" };
  const placed = await api("orders", { previewId: draft.body.previewId, rest: junk });
  assert.equal(placed.status, 400);
});

test("an unsigned preview no longer hides maker lots", async () => {
  const before = await engine.book("SOL-USDC");
  assert.ok(before.asks.length > 0);
  const draft = await api("orders/preview", {
    account: "0x2222222222222222222222222222222222222222",
    pair: "SOL-USDC",
    side: "BUY",
    orderType: "LIMIT",
    qty: "1000",
    price: "100000",
  });
  assert.equal(draft.status, 200);
  const after = await engine.book("SOL-USDC");
  assert.equal(after.asks.length, before.asks.length);
  assert.equal(after.bestAsk, before.bestAsk);
});

test("two takers on one lot: the first signature wins, the second gets 409", async () => {
  const first = generateKey();
  const second = generateKey();
  const order = { pair: "ETH-USDC", side: "BUY", orderType: "MARKET", qty: "0.002" };
  const a = await api("orders/preview", { account: first.accountId, ...order });
  const b = await api("orders/preview", { account: second.accountId, ...order });
  assert.ok(a.body.take && b.body.take);
  assert.deepEqual(a.body.take.lotIds, b.body.take.lotIds);
  const bestAsk = (await engine.book("ETH-USDC")).bestAsk;
  const won = await api("orders", { previewId: a.body.previewId, take: signNep413(first, a.body.take) });
  assert.equal(won.status, 200, JSON.stringify(won.body));
  assert.equal(won.body.fill.price, bestAsk, "a fill reports the maker's price, with the fee separate");
  assert.notEqual(won.body.fill.takerFee, "0");
  const lost = await api("orders", { previewId: b.body.previewId, take: signNep413(second, b.body.take) });
  assert.equal(lost.status, 409);

  // The maker refills the filled level, so the next one-lot order can match too.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const refilled = await engine.book("ETH-USDC");
  assert.equal(refilled.asks.length, 6);
  assert.equal(refilled.asks[0]?.qty, "0.002");
});

test("Phantom-style raw_ed25519 orders go through with a nonce in the payload", async () => {
  const phantom = generateKey();
  const draft = await api("orders/preview", {
    account: phantom.accountId,
    pair: "BTC-USDC",
    side: "BUY",
    orderType: "LIMIT",
    qty: "0.0001",
    price: "1000",
    standard: "raw_ed25519",
  });
  assert.equal(draft.status, 200);
  assert.equal(draft.body.rest.standard, "raw_ed25519");
  assert.equal(JSON.parse(draft.body.rest.message).nonce, draft.body.rest.nonce);
  const placed = await api("orders", { previewId: draft.body.previewId, rest: signRaw(phantom, draft.body.rest.message) });
  assert.equal(placed.status, 200, JSON.stringify(placed.body));

  const named = await api("orders/preview", {
    account: "someone.near",
    pair: "BTC-USDC",
    side: "BUY",
    orderType: "LIMIT",
    qty: "0.0001",
    price: "1000",
    standard: "raw_ed25519",
  });
  assert.equal(named.status, 400);
});

test("a leg must be signed in the standard the preview chose", async () => {
  const key = generateKey();
  const draft = await api("orders/preview", {
    account: key.accountId,
    pair: "BTC-USDC",
    side: "BUY",
    orderType: "LIMIT",
    qty: "0.0001",
    price: "1000",
    standard: "raw_ed25519",
  });
  const asNep413 = signNep413(key, draft.body.rest);
  const placed = await api("orders", { previewId: draft.body.previewId, rest: asNep413 });
  assert.equal(placed.status, 400);
});

test("withdraw only accepts one signed ft_withdraw", async () => {
  const key = generateKey();
  const draft = await api("orders/preview", { account: key.accountId, pair: "BTC-USDC", side: "BUY", orderType: "LIMIT", qty: "0.0001", price: "1000" });
  const tokenDiff = signNep413(key, draft.body.rest);
  const smuggled = await api("withdraw", { account: key.accountId, signed: tokenDiff });
  assert.equal(smuggled.status, 400);

  const withdraw = await api("withdraw/preview", {
    account: key.accountId,
    tokenId: "nep141:wrap.near",
    receiverId: key.accountId,
    amount: "1000",
    chain: "near",
  });
  assert.equal(withdraw.status, 200);
  const simulated = await api("withdraw", { account: key.accountId, signed: signNep413(key, withdraw.body as never) });
  assert.equal(simulated.status, 200, JSON.stringify(simulated.body));
  assert.equal(simulated.body.broadcast, false);

  const badAmount = await api("withdraw/preview", { account: key.accountId, tokenId: "nep141:wrap.near", receiverId: key.accountId, amount: "abc", chain: "other" });
  assert.equal(badAmount.status, 400);
});

test("nonce burn verifies the order nonce instead of rebuilding the message", async () => {
  const owner = generateKey();
  const placed = await restBid(owner.accountId, (leg) => signNep413(owner, leg));
  const id = placed.body.orders[0].id as string;
  const draft = await api("orders/burn-preview", { id, account: owner.accountId });
  assert.equal(draft.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const burned = await api("orders/burn", { id, account: owner.accountId, signed: signNep413(owner, draft.body as never) });
  assert.equal(burned.status, 200, JSON.stringify(burned.body));
  assert.equal(burned.body.verdict, "executed");

  const otherNonce = await api("orders/preview", { account: owner.accountId, pair: "BTC-USDC", side: "BUY", orderType: "LIMIT", qty: "0.0001", price: "1000" });
  const wrong = signNep413(owner, { message: draft.body.message, nonce: otherNonce.body.rest.nonce });
  const refused = await api("orders/burn", { id, account: owner.accountId, signed: wrong });
  assert.equal(refused.status, 400);
});

test("webhooks need a signed registration and a public https URL in production", async () => {
  const owner = generateKey();
  const url = "https://example.com/hook";
  const junk = await api("webhooks", {
    account: owner.accountId,
    url,
    signed: { standard: "webauthn", payload: JSON.stringify({ signer_id: owner.accountId, url }), public_key: "x", signature: "x", client_data_json: "x", authenticator_data: "x" },
  });
  assert.equal(junk.status, 400);

  const draft = await api("webhooks/preview", { account: owner.accountId, url });
  assert.equal(draft.status, 200);
  const registered = await api("webhooks", { account: owner.accountId, url, signed: signNep413(owner, draft.body as never) });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  assert.match(String(registered.body.secret), /^ib_/);

  const { webhookUrlProblem } = await import("../lib/webhooks");
  const prod = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
  assert.equal(webhookUrlProblem("https://hooks.example.com/x", prod), null);
  assert.ok(webhookUrlProblem("http://127.0.0.1:9/x", prod));
  assert.ok(webhookUrlProblem("https://localhost/x", prod));
  assert.ok(webhookUrlProblem("https://169.254.169.254/latest", prod));
  assert.ok(webhookUrlProblem("https://10.0.0.5/x", prod));
  assert.ok(webhookUrlProblem("https://[::1]/x", prod));
  assert.ok(webhookUrlProblem("http://example.com/x", prod));
  assert.equal(webhookUrlProblem("http://127.0.0.1:9/x", { NODE_ENV: "development" } as NodeJS.ProcessEnv), null);
});

test("live mode refuses matches without persistent keys", async () => {
  const { executionDecision } = await import("../lib/live");
  const base = { live: true, verdict: "executed" as const, baseQty: 1n, lot: 1n, quoteQty: 1n, relayerConfigured: true };
  assert.equal(executionDecision({ ...base, persistentKeys: false }).broadcast, false);
  assert.equal(executionDecision({ ...base, persistentKeys: true }).broadcast, true);
});
