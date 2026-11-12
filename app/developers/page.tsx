import type { Metadata } from "next";
import { DevelopersScreen } from "@/components/developers-screen";

export const metadata: Metadata = { title: "Build on the book", description: "Public REST, streams, an embeddable widget and an MCP server for the IntentBook order book." };

export default function DevelopersPage() {
  return <DevelopersScreen />;
}
