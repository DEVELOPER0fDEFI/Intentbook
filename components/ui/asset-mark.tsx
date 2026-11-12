import { cn } from "@/lib/cn";

const MARKS: Record<string, { glyph: string; className: string }> = {
  BTC: { glyph: "₿", className: "bg-gold/15 text-gold border-gold/30" },
  ETH: { glyph: "Ξ", className: "bg-ink/10 text-ink border-ink/25" },
  SOL: { glyph: "◎", className: "bg-bid/12 text-bid border-bid/30" },
  NEAR: { glyph: "Ⓝ", className: "bg-lime/12 text-lime border-lime/30" },
  USDC: { glyph: "$", className: "bg-panel-3 text-ink border-line-strong" },
};

/** Letter-mark for an asset symbol. Not a logo: a typographic stand-in. */
export function AssetMark({ symbol, size = "md", className }: { symbol: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const mark = MARKS[symbol.toUpperCase()] ?? { glyph: symbol.slice(0, 1), className: "bg-panel-3 text-ink border-line-strong" };
  const sizes = { sm: "size-5 text-[0.6875rem]", md: "size-7 text-sm", lg: "size-10 text-lg" } as const;
  return (
    <span aria-hidden className={cn("inline-grid shrink-0 place-items-center rounded-full border font-medium", sizes[size], mark.className, className)}>
      {mark.glyph}
    </span>
  );
}

export function symbolOf(tokenId: string): string {
  const id = tokenId.replace("nep141:", "");
  if (id.startsWith("btc.")) return "BTC";
  if (id.startsWith("eth.")) return "ETH";
  if (id.startsWith("sol.")) return "SOL";
  if (id === "wrap.near") return "NEAR";
  if (id.startsWith("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1")) return "USDC";
  return id.slice(0, 6).toUpperCase();
}
