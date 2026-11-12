import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Shimmer placeholder. `lines` bars of decreasing width. */
export function Skeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="skeleton h-3 rounded-sm" style={{ width: `${100 - index * (60 / Math.max(lines, 1))}%` }} />
      ))}
    </div>
  );
}

/** Empty state: icon, heading, one line of guidance, optional action. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-4 py-10 text-center", className)}>
      <div className="mb-1 grid size-11 place-items-center rounded-full border border-line-strong text-muted">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs leading-5 text-muted">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
