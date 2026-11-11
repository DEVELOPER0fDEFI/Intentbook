"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Dialog({
  trigger,
  title,
  children,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/70" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-[min(640px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-line bg-panel p-5 shadow-2xl",
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <DialogPrimitive.Title className="font-display text-xl">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close className="text-sm text-muted hover:text-ink">Close</DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
