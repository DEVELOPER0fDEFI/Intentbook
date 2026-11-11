/** Protocol fee closure, ported from near/intents TokenDiff::closure.
 * Fee is charged only on negative deltas. Pips::MAX is 1_000_000 (100%).
 * 1 pip = 0.0001%. Live intents.near fee() was 1 on 11 Nov 2026.
 */

export const PIPS_MAX = 1_000_000n;

export function divCeil(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error("divCeil divisor must be positive");
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  return n > 0n ? q + 1n : q;
}

export function divEuclid(n: bigint, d: bigint): bigint {
  if (d <= 0n) throw new Error("divEuclid divisor must be positive");
  const q = n / d;
  const r = n % d;
  if (r === 0n) return q;
  return n < 0n ? q - 1n : q;
}

export function supplyDelta(delta: bigint, feePips: bigint): bigint {
  if (delta < 0n) {
    const inv = PIPS_MAX - feePips;
    return divCeil(delta * inv, PIPS_MAX);
  }
  return delta;
}

export function closureSupplyDelta(supply: bigint, feePips: bigint): bigint {
  const closure = -supply;
  if (closure < 0n) {
    const inv = PIPS_MAX - feePips;
    if (inv <= 0n) throw new Error("fee consumes the whole amount");
    return divEuclid(closure * PIPS_MAX, inv);
  }
  return closure;
}

/** Each entry is one token delta from one signed intent. Do not pre-sum a token:
 * fee rounding is per delta, matching TokenDiff::closure_deltas.
 */
export function closureForDeltas(
  deltas: Iterable<[string, bigint]>,
  feePips: bigint,
): Map<string, bigint> {
  if (feePips < 0n || feePips > PIPS_MAX) throw new Error("fee out of range");
  const supply = new Map<string, bigint>();
  for (const [token, delta] of deltas) {
    if (delta === 0n) continue;
    const next = supplyDelta(delta, feePips);
    supply.set(token, (supply.get(token) ?? 0n) + next);
  }
  const out = new Map<string, bigint>();
  for (const [token, delta] of supply) {
    if (delta === 0n) continue;
    const closure = closureSupplyDelta(delta, feePips);
    if (closure !== 0n) out.set(token, closure);
  }
  return out;
}

export function netSupply(deltas: Iterable<[string, bigint]>, feePips: bigint): Map<string, bigint> {
  const net = new Map<string, bigint>();
  for (const [token, delta] of deltas) {
    if (delta === 0n) continue;
    net.set(token, (net.get(token) ?? 0n) + supplyDelta(delta, feePips));
  }
  return net;
}

export function closureRecord(
  deltas: Iterable<[string, bigint]>,
  feePips: bigint,
): Record<string, string> {
  const map = closureForDeltas(deltas, feePips);
  const keys = [...map.keys()].sort();
  const out: Record<string, string> = {};
  for (const key of keys) out[key] = map.get(key)!.toString();
  return out;
}
