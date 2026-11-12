"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
      className={cn(
        "inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-sm border border-line px-2 text-xs text-muted transition-colors hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {done ? <Check className="size-3.5 text-bid" /> : <Copy className="size-3.5" />}
      <span className="eyebrow !text-[0.625rem]">{done ? "Copied" : label}</span>
    </button>
  );
}

/** Code block with a copy button. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-background">
      <div className="flex min-h-10 items-center justify-between gap-2 border-b border-line px-3">
        <span className="eyebrow text-faint">{label ?? "shell"}</span>
        <CopyButton value={code} />
      </div>
      <pre className="nums overflow-x-auto p-4 text-xs leading-6 text-ink/90">{code}</pre>
    </div>
  );
}
