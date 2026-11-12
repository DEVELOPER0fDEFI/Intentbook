// Entry point for MCP clients: `npx tsx mcp/stdio.ts`. Stdout carries the protocol; logs go to stderr.
import { startStdio } from "./server";

startStdio().catch((error) => {
  console.error(error);
  process.exit(1);
});
