import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Mono uppercase label for a group of content. */
export function SectionLabel({ children, className, tone = "muted" }: { children: ReactNode; className?: string; tone?: "muted" | "lime" }) {
  return <p className={cn("eyebrow", tone === "lime" ? "text-lime" : "text-muted", className)}>{children}</p>;
}

/** The one elevated surface used across the app. */
export function Panel({
  label,
  action,
  children,
  className,
  bodyClassName,
  id,
}: {
  label?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-[var(--radius-panel)] border border-line bg-panel/90 backdrop-blur-sm", className)}>
      {label || action ? (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4 py-2">
          {typeof label === "string" ? <SectionLabel>{label}</SectionLabel> : label}
          {action}
        </header>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
