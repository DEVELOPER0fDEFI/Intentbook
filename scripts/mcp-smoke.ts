// Drives the MCP server over stdio like Claude would: status, book, place a resting bid, cancel it, take liquidity.
// Usage: INTENTBOOK_URL=http://127.0.0.1:43123 npx tsx scripts/mcp-smoke.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function textOf(result: unknown): string {
  return ((result as { content: { text: string }[] }).content[0]?.text) ?? "";
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "mcp/stdio.ts"],
    env: { ...process.env } as Record<string, string>,
    stderr: "inherit",
  });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);
  const tools = await client.listTools();
  console.log("tools:", tools.tools.map((tool) => tool.name).join(", "));

  const status = JSON.parse(textOf(await client.callTool({ name: "intentbook_status", arguments: {} })));
  console.log("status:", { agent: `${String(status.agentAccount).slice(0, 10)}...`, dryRun: status.dryRun, cap: status.maxOrderUsdc });

  const book = JSON.parse(textOf(await client.callTool({ name: "get_book", arguments: { pair: "NEAR-USDC" } })));
  console.log("NEAR book:", { bestBid: book.bestBid, bestAsk: book.bestAsk, lot: book.lot });

  const rest = await client.callTool({
    name: "place_order",
    arguments: { pair: "NEAR-USDC", side: "BUY", qty: "2", order_type: "LIMIT", price: "1", deadline_seconds: 600 },
  });
  const rested = JSON.parse(textOf(rest));
  const id = rested.restingOrders?.[0]?.id;
  console.log("resting bid:", rested.restingOrders?.[0]?.status, id ? "ok" : textOf(rest));

  const cancelled = await client.callTool({ name: "cancel_order", arguments: { order_id: id } });
  console.log("cancel:", cancelled.isError ? textOf(cancelled) : JSON.parse(textOf(cancelled)).order?.status);

  const take = await client.callTool({ name: "place_order", arguments: { pair: "NEAR-USDC", side: "BUY", qty: book.lot ?? "2", order_type: "MARKET" } });
  const taken = take.isError ? { error: textOf(take) } : JSON.parse(textOf(take));
  console.log("market buy:", taken.fill ? { price: taken.fill.price, settlement: taken.fill.settlement, fee: taken.fill.takerFee } : taken);

  const big = await client.callTool({ name: "place_order", arguments: { pair: "BTC-USDC", side: "BUY", qty: "1", order_type: "MARKET" } });
  console.log("cap check:", big.isError ? textOf(big) : "NOT BLOCKED");
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
