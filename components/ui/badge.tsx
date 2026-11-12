import { cn } from "@/lib/cn";

const tones: Record<string, string> = {
  OPEN: "border-lime/40 text-lime",
  FILLED: "border-bid/40 text-bid",
  SIMULATED: "border-gold/40 text-gold",
  CANCELLED: "border-line-strong text-muted",
  EXPIRED: "border-gold/30 text-gold",
  DEAD: "border-ask/40 text-ask",
  FAILED: "border-ask/40 text-ask",
  SUCCESS: "border-bid/40 text-bid",
  REFUNDED: "border-gold/40 text-gold",
  PENDING_DEPOSIT: "border-line-strong text-ink",
  PROCESSING: "border-lime/40 text-lime",
  INCOMPLETE_DEPOSIT: "border-gold/40 text-gold",
  KNOWN_DEPOSIT_TX: "border-line-strong text-ink",
  unfunded: "border-gold/40 text-gold",
  executed: "border-bid/40 text-bid",
  rejected: "border-ask/40 text-ask",
  broadcast: "border-bid/40 text-bid",
  SETTLED: "border-bid/40 text-bid",
};

const labels: Record<string, string> = {
  unfunded: "sigs ok · unfunded",
  executed: "sim passed",
  broadcast: "on chain",
};

export function Badge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        "nums inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[0.625rem] uppercase tracking-[0.12em]",
        tones[value] ?? "border-line-strong text-ink",
        className,
      )}
    >
      {labels[value] ?? value.replace(/_/g, " ")}
    </span>
  );
}
