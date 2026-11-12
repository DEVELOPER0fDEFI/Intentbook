import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../lib/http";
import { RpcUnavailableError, viewCall } from "../lib/verifier";

test("a dead NEAR RPC becomes a clear 503 after one retry round", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  try {
    await assert.rejects(viewCall("current_salt"), (error: unknown) => {
      assert.ok(error instanceof RpcUnavailableError);
      assert.match((error as Error).message, /NEAR RPC did not answer \(fetch failed\)/);
      return true;
    });
    assert.ok(calls >= 4, `expected a retry round, saw ${calls} calls`);
    const res = await run(() => viewCall("current_salt"));
    assert.equal(res.status, 503);
    assert.match(String((await res.json()).error), /Try again in a moment/);
  } finally {
    globalThis.fetch = original;
  }
});
