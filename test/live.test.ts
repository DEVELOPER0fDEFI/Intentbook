import assert from "node:assert/strict";
import test from "node:test";
import { executionDecision, liveRequested, LIVE_MAX_QUOTE_ATOMS } from "../lib/live";

const base = {
  live: true,
  verdict: "executed" as const,
  baseQty: 1n,
  lot: 1n,
  quoteQty: 1_000_000n,
  relayerConfigured: true,
};

test("dry-run never broadcasts", () => {
  assert.equal(liveRequested({} as unknown as NodeJS.ProcessEnv), false);
  assert.equal(liveRequested({ INTENTBOOK_LIVE: "1" } as unknown as NodeJS.ProcessEnv), true);
  const decision = executionDecision({ ...base, live: false });
  assert.equal(decision.broadcast, false);
  assert.match(decision.reason, /Dry-run/);
});

test("live mode refuses a failed simulation, a missing relayer, and an oversized order", () => {
  assert.equal(executionDecision({ ...base, verdict: "unfunded" }).broadcast, false);
  assert.equal(executionDecision({ ...base, verdict: "rejected" }).broadcast, false);
  assert.equal(executionDecision({ ...base, relayerConfigured: false }).broadcast, false);
  assert.equal(executionDecision({ ...base, baseQty: 6n, lot: 1n }).broadcast, false);
  assert.equal(executionDecision({ ...base, quoteQty: LIVE_MAX_QUOTE_ATOMS + 1n }).broadcast, false);
  assert.equal(executionDecision(base).broadcast, true);
});
