import { USDC_DECIMALS } from "./assets";

export function formatAtoms(amount: bigint, decimals: number, fracDigits = decimals): string {
  const neg = amount < 0n;
  const v = neg ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = v / scale;
  let frac = (v % scale).toString().padStart(decimals, "0");
  if (fracDigits < decimals) frac = frac.slice(0, fracDigits);
  frac = frac.replace(/0+$/, "");
  const body = frac ? `${whole.toString()}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

/** Fees are often fractions of a cent, so they keep all six USDC decimals. */
export function formatFee(atoms: bigint): string {
  return formatAtoms(atoms, USDC_DECIMALS, 6);
}

/** Prices under $100 keep four decimals, so ladder levels a few bps apart stay distinct (NEAR trades near $3). */
export function formatPrice(atoms: bigint): string {
  return formatAtoms(atoms, USDC_DECIMALS, atoms < 100_000_000n ? 4 : 2);
}

export function formatUsd(atoms: bigint): string {
  return formatAtoms(atoms, USDC_DECIMALS, 2);
}

export function parseAtoms(input: string, decimals: number): bigint | null {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) return null;
  const padded = frac.padEnd(decimals, "0");
  try {
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
  } catch {
    return null;
  }
}

export function normalizeNumber(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return null;
  let kilo = false;
  if (s.endsWith("k")) {
    kilo = true;
    s = s.slice(0, -1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  if (!kilo) return s;
  const [whole, frac = ""] = s.split(".");
  const digits = `${whole}${frac}`.replace(/^0+(?=\d)/, "");
  const shift = frac.length - 3;
  if (shift <= 0) return `${digits}${"0".repeat(-shift)}`.replace(/^0+(?=\d)/, "") || "0";
  const head = digits.slice(0, digits.length - shift) || "0";
  const tail = digits.slice(digits.length - shift).replace(/0+$/, "");
  return tail ? `${head}.${tail}` : head;
}

export function parsePriceAtoms(raw: string): bigint | null {
  const n = normalizeNumber(raw);
  if (n == null) return null;
  return parseAtoms(n, USDC_DECIMALS);
}

export function quoteAtomsForBase(baseQty: bigint, priceAtoms: bigint, baseDecimals: number): bigint {
  if (baseQty <= 0n || priceAtoms <= 0n) return 0n;
  return (baseQty * priceAtoms) / 10n ** BigInt(baseDecimals);
}

export function priceAtomsFromFill(baseQty: bigint, quoteQty: bigint, baseDecimals: number): bigint {
  if (baseQty <= 0n) return 0n;
  return (quoteQty * 10n ** BigInt(baseDecimals)) / baseQty;
}

export function shortAccount(account: string): string {
  if (account.length <= 14) return account;
  return `${account.slice(0, 6)}...${account.slice(-4)}`;
}

export function nearblocksAccount(account: string): string {
  return `https://nearblocks.io/address/${account}`;
}

export function isImplicitAccount(account: string): boolean {
  return /^[0-9a-f]{64}$/.test(account);
}

export function isEvmAddress(account: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(account);
}
