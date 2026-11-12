"use client";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/panel";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <SectionLabel tone="lime">Something broke</SectionLabel>
      <h1 className="font-display mt-3 text-5xl leading-none">This page hit an error.</h1>
      <p className="nums mt-4 text-sm text-muted">{error.message}</p>
      <Button className="mt-6" variant="cream" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
