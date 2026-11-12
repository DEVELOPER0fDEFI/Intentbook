import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BottomNav, SiteFooter, SiteHeader } from "@/components/site-header";
import { TickerTape } from "@/components/site/ticker-tape";
import { WalletProvider } from "@/components/wallet";
import "./globals.css";

const plexSans = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-sans",
});
const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
});
const instrument = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
});

const DESCRIPTION = "A public limit order book for BTC, ETH, SOL and NEAR that settles as signed NEAR Intents token_diff payloads. No custody.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "https://intentbook.up.railway.app"),
  title: { default: "IntentBook · public order book on NEAR Intents", template: "%s · IntentBook" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "IntentBook", title: "IntentBook · public order book on NEAR Intents", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "IntentBook · public order book on NEAR Intents", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#0a0b09",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${instrument.variable}`}>
      <body className="antialiased">
        <WalletProvider>
          <TickerTape />
          <SiteHeader />
          <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 md:pb-16">{children}</main>
          <SiteFooter />
          <BottomNav />
        </WalletProvider>
      </body>
    </html>
  );
}
