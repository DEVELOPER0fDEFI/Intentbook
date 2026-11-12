import { cn } from "@/lib/cn";

/** Official logos, from @web3icons/core (MIT). See public/tokens/NOTICE.txt. */
const LOGOS = new Set(["BTC", "ETH", "SOL", "NEAR", "USDC"]);

const SIZES = { sm: "size-5", md: "size-7", lg: "size-10" } as const;
const PIXELS = { sm: 20, md: 28, lg: 40 } as const;

/** The asset's logo; a lettered disc for anything without one. */
export function AssetMark({ symbol, size = "md", className }: { symbol: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const sym = symbol.toUpperCase();
  if (LOGOS.has(sym)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs; next/image would add nothing here
      <img
        src={`/tokens/${sym.toLowerCase()}.svg`}
        alt=""
        aria-hidden
        width={PIXELS[size]}
        height={PIXELS[size]}
        className={cn("shrink-0 rounded-full", SIZES[size], className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full border border-line-strong bg-panel-3 text-[0.6875rem] font-medium text-ink",
        SIZES[size],
        className,
      )}
    >
      {sym.slice(0, 1)}
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
