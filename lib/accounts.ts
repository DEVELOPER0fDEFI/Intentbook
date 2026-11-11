import { isEvmAddress, isImplicitAccount } from "./format";

export function isNamedNearAccount(account: string): boolean {
  if (account.length < 2 || account.length > 64) return false;
  if (!/^[a-z0-9]+([._-][a-z0-9]+)*(\.[a-z0-9]+([._-][a-z0-9]+)*)*$/.test(account)) return false;
  return !isImplicitAccount(account);
}

export type AccountKind = "implicit" | "near" | "evm" | "invalid";

export function accountKind(account: string): AccountKind {
  const id = account.trim();
  if (isImplicitAccount(id)) return "implicit";
  if (isEvmAddress(id)) return "evm";
  if (isNamedNearAccount(id)) return "near";
  return "invalid";
}

export function canonicalAccount(account: string): string {
  const id = account.trim();
  if (accountKind(id) === "evm") return id.toLowerCase();
  return id.toLowerCase();
}

export function sameAccount(left: string, right: string): boolean {
  return canonicalAccount(left) === canonicalAccount(right);
}
