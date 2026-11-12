import * as React from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-sm border border-line-strong bg-background/80 px-3 text-sm text-ink outline-none transition-colors placeholder:text-faint hover:border-ink/30 focus-visible:border-lime focus-visible:ring-1 focus-visible:ring-lime disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="eyebrow text-muted">
          {label}
        </label>
        {hint}
      </div>
      {children}
    </div>
  );
}
