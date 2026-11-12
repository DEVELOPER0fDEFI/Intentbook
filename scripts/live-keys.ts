// Makes one ed25519 "hot" key for a small live test and writes it to .env.live (git-ignored).
// The same key is the relayer (pays gas), the operator (fees + closure) and the market maker.
// Only the public account id is printed. Copy the values into Railway yourself; never paste them in chat.
//
// Usage: npx tsx scripts/live-keys.ts            (refuses to overwrite an existing .env.live)
//        npx tsx scripts/live-keys.ts --show-id  (prints the account id of an existing .env.live)
import fs from "node:fs";
import path from "node:path";
import bs58 from "bs58";
import { parseSecretKey } from "../lib/keys";
import { bytesToHex, generateKey } from "../lib/nep413";

const file = path.join(process.cwd(), ".env.live");

if (process.argv.includes("--show-id")) {
  if (!fs.existsSync(file)) throw new Error(".env.live does not exist yet");
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((row) => row.startsWith("INTENTBOOK_OPERATOR_SECRET="));
  if (!line) throw new Error(".env.live has no INTENTBOOK_OPERATOR_SECRET");
  console.log(parseSecretKey(line.split("=")[1] ?? "").accountId);
  process.exit(0);
}

if (fs.existsSync(file)) {
  console.error(".env.live already exists. Delete it first if you really want a new key; funds sent to the old account stay with the old key.");
  process.exit(1);
}

const key = generateKey();
const full = new Uint8Array(64);
full.set(key.secretKey, 0);
full.set(key.publicKey, 32);
const nearSecret = `ed25519:${bs58.encode(full)}`;
const hexSecret = bytesToHex(key.secretKey);

fs.writeFileSync(
  file,
  [
    "# Live test key. Git-ignored. Copy these into Railway variables; do not commit or paste them anywhere else.",
    "INTENTBOOK_LIVE=1",
    `NEAR_RELAYER_ACCOUNT=${key.accountId}`,
    `NEAR_RELAYER_PRIVATE_KEY=${nearSecret}`,
    `INTENTBOOK_OPERATOR_SECRET=${hexSecret}`,
    `INTENTBOOK_MM_SECRET=${hexSecret}`,
    "INTENTBOOK_LOT_NEAR=0.1",
    "",
  ].join("\n"),
  { mode: 0o600 },
);

console.log("Wrote .env.live (secrets not shown).");
console.log(`Hot account (relayer, operator and market maker): ${key.accountId}`);
console.log(`NearBlocks: https://nearblocks.io/address/${key.accountId}`);
