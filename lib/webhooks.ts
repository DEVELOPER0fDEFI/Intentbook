import { createHmac, randomBytes } from "node:crypto";
import { bookStore } from "./store";

export function retryDelayMs(attempt: number): number {
  const steps = [1_000, 5_000, 30_000, 120_000, 600_000];
  return steps[Math.min(Math.max(attempt, 0), steps.length - 1)] ?? 600_000;
}

export function signWebhook(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
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
