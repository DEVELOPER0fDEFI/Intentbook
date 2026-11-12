"use client";

import { useId } from "react";
import { changePct } from "@/components/site/use-market";
import { Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";

interface Point {
  t: number;
  mid: number;
}

export function MidChart({ points, mid, source, rheaMid, base }: { points: Point[]; mid: string | null; source: string | null; rheaMid?: string | null; base: string }) {
  const gradient = useId();
  const pct = changePct(points);
  const up = (pct ?? 0) >= 0;
  const width = 640;
  const height = 180;
  const values = points.map((point) => point.mid);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const span = max - min || 1;
  const coords = points.map((point, index) => [
    (index / Math.max(points.length - 1, 1)) * width,
    height - 14 - ((point.mid - min) / span) * (height - 34),
  ]);
  const line = coords.map(([x, y]) => `${x!.toFixed(1)},${y!.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const stroke = up ? "var(--color-bid)" : "var(--color-ask)";

  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-panel/90" aria-label="Reference price">
      <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-4">
        <div>
          <p className="eyebrow text-muted">{base} reference mid</p>
          <p className="font-display mt-1 text-5xl leading-none">{mid ? `$${mid}` : "…"}</p>
        </div>
        <div className="nums text-right text-[0.6875rem] leading-5 text-muted">
          {pct !== null ? <p className={cn("text-sm", up ? "text-bid" : "text-ask")}>{`${up ? "+" : ""}${pct.toFixed(3)}% session`}</p> : null}
          <p>{source ?? "waiting for 1Click prices"}</p>
          {rheaMid ? <p>Rhea pool ${rheaMid}</p> : null}
        </div>
      </header>
      {points.length < 2 ? (
        <div className="relative h-44 px-4 pb-4 pt-6">
          <Skeleton lines={4} className="opacity-50" />
          <p className="nums absolute inset-x-0 bottom-6 text-center text-[0.6875rem] text-muted">The line starts after the second 1Click price sample.</p>
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="mt-2 h-44 w-full" role="img" aria-label={`${base} reference mid over this session`}>
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={width} y1={height * f} y2={height * f} stroke="var(--color-line)" strokeDasharray="2 6" />
          ))}
          <polygon fill={`url(#${gradient})`} points={`0,${height} ${line} ${width},${height}`} />
          <polyline fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" points={line} />
          {last ? <circle cx={last[0]} cy={last[1]} r="4" fill={stroke} /> : null}
        </svg>
      )}
      <p className="nums border-t border-line px-4 py-2 text-[0.625rem] uppercase tracking-[0.12em] text-faint">
        Sampled from 1Click /v0/tokens · the maker ladder quotes around it
      </p>
    </section>
  );
}
