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

export interface WebhookRow {
  id: string;
  account: string;
  url: string;
  secret: string;
}

export interface DeliveryRow {
  id: string;
  webhookId: string;
  body: string;
  secret: string;
  url: string;
  attempts: number;
  nextAt: number;
  status: string;
}

export interface BookStore {
  load(): BookSnapshot;
  save(snapshot: Pick<BookSnapshot, "orders" | "fills">): void;
  rememberNonce(account: string, nonce: string): void;
  hasNonce(account: string, nonce: string): boolean;
  saveWebhook(row: WebhookRow): void;
  listWebhooks(): WebhookRow[];
  enqueueDelivery(row: { id: string; webhookId: string; body: string; secret: string; url: string }): void;
  dueDeliveries(now: number): DeliveryRow[];
  markDelivery(id: string, status: string, attempts: number, nextAt: number): void;
  creditReferrer(row: { id: string; referrer: string; fillId: string; feeAtoms: string; shareAtoms: string }): void;
  referrerTotal(referrer: string): { fills: number; shareAtoms: string };
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS fills (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS nonces (account TEXT NOT NULL, nonce TEXT NOT NULL, PRIMARY KEY (account, nonce));
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY,
    webhook_id TEXT NOT NULL,
    body TEXT NOT NULL,
    secret TEXT NOT NULL,
    url TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    next_at INTEGER NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS referrer_credits (
    id TEXT PRIMARY KEY,
    referrer TEXT NOT NULL,
    fill_id TEXT NOT NULL,
    fee_atoms TEXT NOT NULL,
    share_atoms TEXT NOT NULL
  );
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
    saveWebhook(row) {
      db.prepare("INSERT INTO webhooks (id, account, url, secret) VALUES (?, ?, ?, ?)").run(row.id, row.account.toLowerCase(), row.url, row.secret);
    },
    listWebhooks() {
      return db
        .prepare("SELECT id, account, url, secret FROM webhooks")
        .all()
        .map((row) => {
          const item = row as WebhookRow;
          return { id: String(item.id), account: String(item.account), url: String(item.url), secret: String(item.secret) };
        });
    },
    enqueueDelivery(row) {
      db.prepare(
        "INSERT INTO deliveries (id, webhook_id, body, secret, url, attempts, next_at, status) VALUES (?, ?, ?, ?, ?, 0, ?, 'pending')",
      ).run(row.id, row.webhookId, row.body, row.secret, row.url, Date.now());
    },
    dueDeliveries(now) {
      return db
        .prepare("SELECT id, webhook_id, body, secret, url, attempts, next_at, status FROM deliveries WHERE status != 'sent' AND status != 'dead' AND next_at <= ?")
        .all(now)
        .map((row) => {
          const item = row as {
            id: string;
            webhook_id: string;
            body: string;
            secret: string;
            url: string;
            attempts: number;
            next_at: number;
            status: string;
          };
          return {
            id: String(item.id),
            webhookId: String(item.webhook_id),
            body: String(item.body),
            secret: String(item.secret),
            url: String(item.url),
            attempts: Number(item.attempts),
            nextAt: Number(item.next_at),
            status: String(item.status),
          };
        });
    },
    markDelivery(id, status, attempts, nextAt) {
      db.prepare("UPDATE deliveries SET status = ?, attempts = ?, next_at = ? WHERE id = ?").run(status, attempts, nextAt, id);
    },
    creditReferrer(row) {
      db.prepare("INSERT OR IGNORE INTO referrer_credits (id, referrer, fill_id, fee_atoms, share_atoms) VALUES (?, ?, ?, ?, ?)").run(
        row.id,
        row.referrer,
        row.fillId,
        row.feeAtoms,
        row.shareAtoms,
      );
    },
    referrerTotal(referrer) {
      const rows = db.prepare("SELECT share_atoms FROM referrer_credits WHERE referrer = ?").all(referrer) as { share_atoms: string }[];
      let total = 0n;
      for (const row of rows) total += BigInt(row.share_atoms || "0");
      return { fills: rows.length, shareAtoms: total.toString() };
    },
  };
}

let singleton: BookStore | null = null;

export function sqliteFilePath(): string {
  return process.env.SQLITE_PATH || path.join(process.cwd(), ".data", "intentbook.sqlite");
}

export function ensureSqliteDir(): string {
  const file = sqliteFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

export function bookStore(): BookStore {
  if (singleton) return singleton;
  singleton = createBookStore(new DatabaseSync(ensureSqliteDir()));
  return singleton;
}

export function rememberNonce(account: string, nonce: string) {
  bookStore().rememberNonce(account, nonce);
}

export function hasNonce(account: string, nonce: string): boolean {
  return bookStore().hasNonce(account, nonce);
}
