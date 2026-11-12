import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/panel";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-20 text-center">
      <SectionLabel tone="lime">404</SectionLabel>
      <h1 className="font-display mt-3 text-6xl leading-none">
        No order <span className="italic text-lime">at this price.</span>
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted">This page is not on the book. The markets are one click away.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild variant="cream">
          <Link href="/">Open the book</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/activity">See activity</Link>
        </Button>
      </div>
    </div>
  );
}
