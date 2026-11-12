import type { Metadata } from "next";
import { AgentsScreen } from "@/components/agents-screen";

export const metadata: Metadata = { title: "AI agents", description: "Let Claude, Codex or any MCP client trade on IntentBook with its own key and a spending cap." };

export default function AgentsPage() {
  return <AgentsScreen />;
}
