import { cn } from "@/lib/cn";

const tones: Record<string, string> = {
  OPEN: "bg-lime/15 text-lime",
  FILLED: "bg-bid/15 text-bid",
  SIMULATED: "bg-gold/15 text-gold",
  CANCELLED: "bg-panel-2 text-muted",
  EXPIRED: "bg-panel-2 text-gold",
  DEAD: "bg-ask/15 text-ask",
  FAILED: "bg-ask/15 text-ask",
  SUCCESS: "bg-bid/15 text-bid",
  REFUNDED: "bg-gold/15 text-gold",
  PENDING_DEPOSIT: "bg-panel-2 text-ink",
  PROCESSING: "bg-lime/15 text-lime",
  INCOMPLETE_DEPOSIT: "bg-gold/15 text-gold",
  KNOWN_DEPOSIT_TX: "bg-panel-2 text-ink",
  unfunded: "bg-gold/15 text-gold",
  executed: "bg-bid/15 text-bid",
  rejected: "bg-ask/15 text-ask",
  broadcast: "bg-bid/15 text-bid",
  SETTLED: "bg-bid/15 text-bid",
};

export function Badge({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide", tones[value] ?? "bg-panel-2 text-ink")}>
      {value}
    </span>
  );
}
