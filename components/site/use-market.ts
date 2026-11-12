"use client";

import { useEffect, useState } from "react";

export interface TickerRow {
  pair: string;
  mid: string | null;
  bestBid: string | null;
  bestAsk: string | null;
  history: { t: number; mid: number }[];
}

export interface Health {
  dryRun?: boolean;
  liveExecution?: "off" | "armed" | "refused";
  takerFeeBps?: number;
  makerFeeBps?: number;
  feePips?: number;
  salt?: string;
}

/** Polls the ticker. Shared by the tape, the pair bar and the hero. */
export function useTicker(intervalMs = 8000): TickerRow[] {
  const [rows, setRows] = useState<TickerRow[]>([]);
  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/v1/ticker")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!stop && data?.pairs) setRows(data.pairs as TickerRow[]);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, intervalMs);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [intervalMs]);
  return rows;
}

let healthRequest: Promise<Health | null> | null = null;

export function useHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    healthRequest ??= fetch("/api/v1/health")
      .then((res) => res.json() as Promise<Health>)
      .catch(() => null);
    void healthRequest.then((data) => setHealth(data));
  }, []);
  return health;
}

/** Percent change across the sampled history, or null with too few samples. */
export function changePct(history: { mid: number }[]): number | null {
  if (history.length < 2) return null;
  const first = history[0]!.mid;
  const last = history[history.length - 1]!.mid;
  if (!first) return null;
  return ((last - first) / first) * 100;
}
