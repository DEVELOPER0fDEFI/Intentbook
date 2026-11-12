import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import { BottomNav, SiteFooter, SiteHeader } from "@/components/site-header";
import { TickerTape } from "@/components/site/ticker-tape";
import { WalletProvider } from "@/components/wallet";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument" });

export const metadata: Metadata = {
  title: "IntentBook · public order book on NEAR Intents",
  description: "A public limit order book for BTC, ETH, SOL and NEAR that settles as signed NEAR Intents token_diff payloads. No custody.",
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
