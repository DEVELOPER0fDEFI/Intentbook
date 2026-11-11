import type { PairId } from "./types";

export interface RoutePlan {
  book: boolean;
  oneclick: boolean;
  rhea: boolean;
  note: string;
}

/** Market size the book cannot take in whole lots is quoted, not executed. */
export function routePlan(input: { taken: number; leftover: bigint; pair: PairId }): RoutePlan {
  const thin = input.leftover > 0n;
  const rhea = thin && input.pair === "NEAR-USDC";
  const oneclick = thin;
  let note = "The book can take this order in whole lots.";
  if (thin && input.taken === 0) {
    note = "The book has no whole lot at this size. The remainder is quoted on 1Click and is not executed.";
  } else if (thin) {
    note = "Part of the order crosses the book. The remainder is quoted on 1Click and is not executed.";
  }
  if (rhea) {
    note = `${note} NEAR also gets a Rhea swap quote.`;
  }
  return { book: input.taken > 0, oneclick, rhea, note };
}
