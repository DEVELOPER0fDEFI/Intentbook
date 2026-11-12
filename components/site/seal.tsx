import { cn } from "@/lib/cn";

/** Rotating circular seal: "signed · matched · settled on NEAR Intents". Decorative. */
export function Seal({ className }: { className?: string }) {
  const text = "SIGNED · MATCHED · SETTLED ON NEAR INTENTS · NO CUSTODY · ";
  return (
    <div className={cn("relative aspect-square", className)} aria-hidden>
      <svg viewBox="0 0 200 200" className="animate-spin-slow absolute inset-0 size-full">
        <defs>
          <path id="seal-ring" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <circle cx="100" cy="100" r="96" fill="none" stroke="var(--color-line-strong)" strokeWidth="1" />
        <circle cx="100" cy="100" r="62" fill="none" stroke="var(--color-line-strong)" strokeWidth="1" strokeDasharray="2 4" />
        <text className="nums" fill="var(--color-muted)" fontSize="11.2" letterSpacing="3.1">
          <textPath href="#seal-ring">{text}</textPath>
        </text>
      </svg>
      <div className="absolute inset-[24%] grid place-items-center rounded-full border border-lime/40 bg-lime/[0.06]">
        <div className="text-center">
          <p className="font-display text-4xl italic leading-none text-lime sm:text-5xl">IB</p>
          <p className="eyebrow mt-1 !text-[0.625rem] text-muted">token_diff</p>
        </div>
      </div>
    </div>
  );
}
