import { pairByBase } from "./assets";
import type { PairId, Side } from "./types";

export interface ParsedOrder {
  side: Side;
  pair: PairId;
  qty: string;
  orderType: "LIMIT" | "MARKET";
  price?: string;
}

const PATTERN =
  /^\s*(buy|sell)\s+(\d+(?:\.\d+)?)\s+(btc|eth|sol|near)\s+(?:at\s+market|market|now|at\s+(\$?\d[\d,]*(?:\.\d+)?k?))(?:\s+with\s+usdc)?\s*$/i;

export function parsePlain(text: string): ParsedOrder | null {
  const match = PATTERN.exec(text.trim());
  if (!match) return null;
  const side = match[1]!.toUpperCase() as Side;
  const qty = match[2]!;
  const pair = pairByBase(match[3]!);
  if (!pair) return null;
  const price = match[4]?.replace(/^\$/, "");
  if (!price) return { side, pair, qty, orderType: "MARKET" };
  return { side, pair, qty, orderType: "LIMIT", price };
}
