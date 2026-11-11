"use client";

import { bytesToHex, generateKey, hexToBytes, keyFromSecret, signExisting, type DemoKey } from "./nep413";

const STORAGE = "intentbook.demo.v1";

export function loadDemoKey(): DemoKey {
  const existing = window.localStorage.getItem(STORAGE);
  if (existing) {
    try {
      return keyFromSecret(hexToBytes(existing));
    } catch {
      window.localStorage.removeItem(STORAGE);
    }
  }
  const created = generateKey();
  window.localStorage.setItem(STORAGE, bytesToHex(created.secretKey));
  return created;
}

export { signExisting };
