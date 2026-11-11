export interface IntentBookOptions {
  baseUrl: string;
}

export class IntentBookClient {
  constructor(private readonly options: IntentBookOptions) {}

  private url(path: string) {
    return `${this.options.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async book(pair = "BTC-USDC") {
    return this.get(`/api/v1/book?pair=${encodeURIComponent(pair)}`);
  }

  async trades(pair = "BTC-USDC") {
    return this.get(`/api/v1/trades?pair=${encodeURIComponent(pair)}`);
  }

  async ticker() {
    return this.get("/api/v1/ticker");
  }

  async candles(pair = "BTC-USDC", interval = "1m") {
    return this.get(`/api/v1/candles?pair=${encodeURIComponent(pair)}&interval=${encodeURIComponent(interval)}`);
  }

  async depth(pair = "BTC-USDC", group = "1") {
    return this.get(`/api/v1/depth?pair=${encodeURIComponent(pair)}&group=${encodeURIComponent(group)}`);
  }

  async compare(pair: string, side: "BUY" | "SELL", qty: string) {
    const params = new URLSearchParams({ pair, side, qty });
    return this.get(`/api/v1/compare?${params}`);
  }

  async best(pair: string, side: "BUY" | "SELL", qty: string) {
    const params = new URLSearchParams({ pair, side, qty });
    return this.get(`/api/v1/quote/best?${params}`);
  }

  async account(account: string) {
    return this.get(`/api/v1/accounts/${encodeURIComponent(account)}`);
  }

  async place(body: unknown) {
    return this.post("/api/v1/orders", body);
  }

  async preview(body: unknown) {
    return this.post("/api/v1/orders/preview", body);
  }

  async cancelSigned(signed: unknown) {
    return this.post("/api/v1/orders/cancel", { signed });
  }

  async registerWebhook(body: unknown) {
    return this.post("/api/v1/webhooks", body);
  }

  stream(pair: string, onEvent: (event: unknown) => void) {
    const source = new EventSource(this.url(`/api/v1/stream?pair=${encodeURIComponent(pair)}`));
    source.onmessage = (message) => onEvent(JSON.parse(message.data));
    return () => source.close();
  }

  private async get(path: string) {
    const res = await fetch(this.url(path));
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  private async post(path: string, body: unknown) {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "request failed");
    return data;
  }
}
