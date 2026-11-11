import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Fill, StoredOrder } from "./types";

export interface NonceRow {
  account: string;
  nonce: string;
}

export interface BookSnapshot {
  orders: StoredOrder[];
  fills: Fill[];
  nonces: NonceRow[];
}

export interface BookStore {
  load(): BookSnapshot;
  save(snapshot: Pick<BookSnapshot, "orders" | "fills">): void;
  rememberNonce(account: string, nonce: string): void;
  hasNonce(account: string, nonce: string): boolean;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS fills (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS nonces (account TEXT NOT NULL, nonce TEXT NOT NULL, PRIMARY KEY (account, nonce));
`;

export function createBookStore(db: DatabaseSync): BookStore {
  db.exec(SCHEMA);
  return {
    load() {
      const orders = db
        .prepare("SELECT json FROM orders")
        .all()
        .map((row) => JSON.parse(String((row as { json: string }).json)) as StoredOrder);
      const fills = db
        .prepare("SELECT json FROM fills")
        .all()
        .map((row) => JSON.parse(String((row as { json: string }).json)) as Fill);
      const nonces = db
        .prepare("SELECT account, nonce FROM nonces")
        .all()
        .map((row) => ({ account: String((row as NonceRow).account), nonce: String((row as NonceRow).nonce) }));
      return { orders, fills, nonces };
    },
    save(snapshot) {
      db.exec("BEGIN");
      try {
        db.exec("DELETE FROM orders");
        db.exec("DELETE FROM fills");
        const insertOrder = db.prepare("INSERT INTO orders (id, json) VALUES (?, ?)");
        for (const order of snapshot.orders) insertOrder.run(order.id, JSON.stringify(order));
        const insertFill = db.prepare("INSERT INTO fills (id, json) VALUES (?, ?)");
        for (const fill of snapshot.fills) insertFill.run(fill.id, JSON.stringify(fill));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    rememberNonce(account, nonce) {
      db.prepare("INSERT OR IGNORE INTO nonces (account, nonce) VALUES (?, ?)").run(account.toLowerCase(), nonce);
    },
    hasNonce(account, nonce) {
      const row = db.prepare("SELECT 1 AS ok FROM nonces WHERE account = ? AND nonce = ?").get(account.toLowerCase(), nonce) as
        | { ok: number }
        | undefined;
      return Boolean(row);
    },
  };
}

let singleton: BookStore | null = null;

export function bookStore(): BookStore {
  if (singleton) return singleton;
  const file = process.env.SQLITE_PATH || path.join(process.cwd(), ".data", "intentbook.sqlite");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  singleton = createBookStore(new DatabaseSync(file));
  return singleton;
}

export function rememberNonce(account: string, nonce: string) {
  bookStore().rememberNonce(account, nonce);
}

export function hasNonce(account: string, nonce: string): boolean {
  return bookStore().hasNonce(account, nonce);
}
