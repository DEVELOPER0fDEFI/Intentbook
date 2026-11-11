import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Outfit } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { WalletProvider } from "@/components/wallet";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "IntentBook",
  description: "A public limit order book that settles with NEAR Intents token_diff signatures.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${plex.variable} ${fraunces.variable} antialiased`}>
        <WalletProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
