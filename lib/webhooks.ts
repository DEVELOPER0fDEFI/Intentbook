import { createHmac, randomBytes } from "node:crypto";
import { bookStore } from "./store";

export function retryDelayMs(attempt: number): number {
  const steps = [1_000, 5_000, 30_000, 120_000, 600_000];
  return steps[Math.min(Math.max(attempt, 0), steps.length - 1)] ?? 600_000;
}

export function signWebhook(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function privateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function internalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (privateIpv4(host)) return true;
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true;
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    if (mapped && privateIpv4(mapped[1]!)) return true;
  }
  return false;
}

/**
 * Null when the URL may receive webhooks. Production allows only https to public hosts.
 * Development also allows http to localhost for tests. Hostnames are not resolved here,
 * so a public name that resolves to a private address is not caught.
 */
export function webhookUrlProblem(raw: string, env: NodeJS.ProcessEnv = process.env): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Webhook URL is invalid";
  }
  const production = env.NODE_ENV === "production";
  const local = internalHost(url.hostname);
  if (!production && local && (url.protocol === "http:" || url.protocol === "https:")) return null;
  if (url.protocol !== "https:") return "Webhook URL must be https";
  if (local) return "Webhook URL must point at a public host";
  if (url.username || url.password) return "Webhook URL must not contain credentials";
  return null;
}

export function newWebhookSecret(): string {
  return `ib_${randomBytes(24).toString("hex")}`;
}

export async function fanoutFill(fill: Record<string, unknown>) {
  const accounts = new Set<string>();
  if (typeof fill.takerAccount === "string") accounts.add(fill.takerAccount.toLowerCase());
  if (Array.isArray(fill.makerAccounts)) {
    for (const account of fill.makerAccounts) {
      if (typeof account === "string") accounts.add(account.toLowerCase());
    }
  }
  const hooks = bookStore().listWebhooks().filter((hook) => accounts.has(hook.account.toLowerCase()));
  const body = JSON.stringify({ type: "fill", fill });
  for (const hook of hooks) {
    bookStore().enqueueDelivery({
      id: randomBytes(12).toString("hex"),
      webhookId: hook.id,
      body,
      secret: hook.secret,
      url: hook.url,
    });
  }
  await drainWebhooks(Date.now());
}

export async function drainWebhooks(now = Date.now()) {
  const due = bookStore().dueDeliveries(now);
  for (const job of due) {
    const signature = signWebhook(job.secret, job.body);
    try {
      const res = await fetch(job.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-intentbook-signature": signature,
        },
        body: job.body,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        bookStore().markDelivery(job.id, "sent", job.attempts + 1, now);
        continue;
      }
    } catch {
      // Retry below.
    }
    const attempts = job.attempts + 1;
    if (attempts >= 5) {
      bookStore().markDelivery(job.id, "dead", attempts, now);
    } else {
      bookStore().markDelivery(job.id, "retry", attempts, now + retryDelayMs(attempts));
    }
  }
}
