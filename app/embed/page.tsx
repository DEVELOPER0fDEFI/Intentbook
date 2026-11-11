import { TradeScreen } from "@/components/trade-screen";

export default async function EmbedPage({ searchParams }: { searchParams: Promise<{ referrer?: string }> }) {
  const params = await searchParams;
  const referrer = params.referrer || "";
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Embedded IntentBook{referrer ? ` for referrer ${referrer}` : ""}. Dry-run. The referrer earns a share of the taker fee.</p>
      <TradeScreen referrer={referrer} />
    </div>
  );
}
