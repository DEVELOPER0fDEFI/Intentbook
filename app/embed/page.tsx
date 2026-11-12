import { TradeScreen } from "@/components/trade-screen";

export default async function EmbedPage({ searchParams }: { searchParams: Promise<{ referrer?: string }> }) {
  const params = await searchParams;
  const referrer = params.referrer || "";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <a href="/" target="_blank" rel="noreferrer" className="font-display text-2xl italic leading-none">
          IntentBook
        </a>
        <p className="nums text-[0.6875rem] text-muted">
          Embedded book{referrer ? ` · ${referrer} earns a share of the taker fee` : ""} · settles on intents.near
        </p>
      </div>
      <TradeScreen referrer={referrer} compact />
    </div>
  );
}
