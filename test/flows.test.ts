import assert from "node:assert/strict";
import test from "node:test";
import { accountKind } from "../lib/accounts";
import { ONCHAIN_CANCEL_NOTE, nearDepositCall, statusTone, withdrawIntent } from "../lib/chain";
import { routePlan } from "../lib/route";

test("account kinds cover NEAR names, implicit ids, and EVM addresses", () => {
  assert.equal(accountKind("alice.near"), "near");
  assert.equal(accountKind("a".repeat(64)), "implicit");
  assert.equal(accountKind("0x0000000000000000000000000000000000000001"), "evm");
  assert.equal(accountKind("Alice.near"), "invalid");
});

test("thin NEAR markets route to 1Click and Rhea without execution", () => {
  const plan = routePlan({ taken: 0, leftover: 2n, pair: "NEAR-USDC" });
  assert.equal(plan.oneclick, true);
  assert.equal(plan.rhea, true);
  assert.match(plan.note, /not executed/);
  const full = routePlan({ taken: 1, leftover: 0n, pair: "BTC-USDC" });
  assert.equal(full.oneclick, false);
  assert.equal(full.rhea, false);
});

test("deposit and withdraw builders stay unsigned", () => {
  const call = nearDepositCall({ tokenContract: "wrap.near", amount: "1000" });
  assert.equal(call.methodName, "ft_transfer_call");
  assert.equal(call.args.receiver_id, "intents.near");
  assert.equal(call.deposit, "1");
  const intent = withdrawIntent({
    tokenId: "nep141:wrap.near",
    receiverId: "alice.near",
    amount: "5",
  });
  assert.equal(intent.token, "wrap.near");
  assert.equal(intent.intent, "ft_withdraw");
  assert.match(ONCHAIN_CANCEL_NOTE, /no separate invalidate/i);
  assert.equal(statusTone("REFUNDED"), "bad");
  assert.equal(statusTone("FAILED"), "bad");
  assert.equal(statusTone("PENDING_DEPOSIT"), "wait");
});
