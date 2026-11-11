"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-6">
      <h1 className="font-display text-3xl">This page hit an error</h1>
      <p className="mt-2 text-sm text-muted">{error.message}</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
