import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, type AgentConfig } from "../mcp/server";
import { bytesToHex, generateKey, verifySigned } from "../lib/nep413";

async function connect(config: AgentConfig) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await buildServer(config).connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  return client;
}

function firstText(result: unknown): string {
  return ((result as { content: { text: string }[] }).content[0]?.text) ?? "";
}

test("the MCP server signs orders locally and enforces the agent's guardrails", async () => {
  const key = generateKey();
  const config: AgentConfig = {
    baseUrl: "http://book.test",
    key,
    keySource: "test",
    maxOrderUsdc: 25,
    allowedPairs: ["NEAR-USDC", "BTC-USDC"],
  };
  const posted: { path: string; body: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const reply = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    if (url.pathname === "/api/v1/ticker") return reply({ pairs: [{ pair: "NEAR-USDC", mid: "3.38" }, { pair: "BTC-USDC", mid: "72000" }] });
    if (url.pathname === "/api/v1/orders/preview") {
      posted.push({ path: url.pathname, body });
      const message = JSON.stringify({ signer_id: body.account, deadline: "2099-01-01T00:00:00.000Z", intents: [] });
      return reply({ previewId: "p1", take: null, rest: { message, nonce: Buffer.alloc(32, 1).toString("base64"), standard: "nep413" }, warnings: [] });
    }
    if (url.pathname === "/api/v1/orders") {
      posted.push({ path: url.pathname, body });
      return reply({ ok: true, orders: [{ id: "o1", side: "BUY", qty: "1", price: "3", status: "OPEN" }], fill: null });
    }
    return reply({ dryRun: true, liveExecution: "off" });
  }) as typeof fetch;
  try {
    const client = await connect(config);
    const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
    assert.deepEqual(tools, ["best_price", "cancel_order", "get_book", "get_ticker", "intentbook_status", "my_balances", "my_orders", "place_order"]);

    const tooBig = await client.callTool({ name: "place_order", arguments: { pair: "BTC-USDC", side: "BUY", qty: "1", order_type: "MARKET" } });
    assert.equal(tooBig.isError, true);
    assert.match(firstText(tooBig), /above this agent's cap/);

    const notAllowed = await client.callTool({ name: "place_order", arguments: { pair: "ETH-USDC", side: "BUY", qty: "0.001", price: "100" } });
    assert.equal(notAllowed.isError, true);

    const placed = await client.callTool({ name: "place_order", arguments: { pair: "NEAR-USDC", side: "BUY", qty: "1", price: "3" } });
    assert.notEqual(placed.isError, true, firstText(placed));
    const commit = posted.find((item) => item.path === "/api/v1/orders");
    assert.ok(commit, "the signed order was submitted");
    const rest = commit.body.rest as Parameters<typeof verifySigned>[0];
    assert.equal(verifySigned(rest), true);
    assert.equal(rest.public_key.startsWith("ed25519:"), true);
    assert.ok(!JSON.stringify(posted).includes(bytesToHex(key.secretKey)), "the secret key never leaves the agent");
    await client.close();
  } finally {
    globalThis.fetch = original;
  }
});
