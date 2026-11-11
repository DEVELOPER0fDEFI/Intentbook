import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createBookStore } from "../lib/store";
import type { Fill, StoredOrder } from "../lib/types";

test("sqlite keeps orders, fills, and cancelled nonces", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "intentbook-"));
  const db = new DatabaseSync(path.join(dir, "book.sqlite"));
  const store = createBookStore(db);
  const order = {
    id: "o1",
    pair: "BTC-USDC",
    side: "BUY",
    price: "1",
    priceAtoms: "1000000",
    qty: "1",
    originalQty: "1",
    quoteQty: "1",
    owner: "alice.near",
    role: "user",
    signed: {
      standard: "nep413",
      payload: { recipient: "intents.near", nonce: "abc", message: "{}" },
      public_key: "ed25519:x",
      signature: "ed25519:y",
    },
    nonce: "abc",
    deadline: "2026-11-14T23:59:00.000Z",
    createdAt: "2026-11-11T00:00:00.000Z",
    status: "OPEN",
    memo: "test",
  } satisfies StoredOrder;
  const fill = {
    id: "f1",
    pair: "BTC-USDC",
    price: "1",
    baseQty: "1",
    quoteQty: "1",
    makerIds: [],
    makerAccounts: [],
    takerAccount: "alice.near",
    status: "SIMULATED",
    settlement: "unfunded",
    signaturesAccepted: true,
    simulate: { error: "insufficient balance" },
    closure: {},
    diffs: [],
    note: "dry-run",
    createdAt: "2026-11-11T00:00:00.000Z",
    fallback: null,
    fallbackError: null,
  } satisfies Fill;
  store.save({ orders: [order], fills: [fill] });
  store.rememberNonce("Alice.near", "abc");
  const loaded = store.load();
  assert.equal(loaded.orders[0]?.id, "o1");
  assert.equal(loaded.fills[0]?.id, "f1");
  assert.equal(store.hasNonce("alice.near", "abc"), true);
  assert.equal(store.hasNonce("alice.near", "other"), false);
  db.close();
});
