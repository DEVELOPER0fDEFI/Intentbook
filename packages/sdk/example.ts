import { signTokenDiff, generateKey } from "../../lib/nep413";
import { IntentBookClient } from "./src/index";

const baseUrl = process.env.INTENTBOOK_URL || "http://127.0.0.1:43123";
const client = new IntentBookClient({ baseUrl });

const book = await client.book("BTC-USDC");
console.log("best bid", book.bestBid, "best ask", book.bestAsk);

const key = generateKey();
const deadline = new Date(Date.now() + 60_000).toISOString();
const signed = signTokenDiff({
  secretKey: key.secretKey,
  deadline,
  diff: { "nep141:wrap.near": "1", "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1": "-1" },
  memo: "intentbook:example",
  saltHex: "252812b3",
});
console.log("signed standard", signed.standard, "account", key.accountId);
