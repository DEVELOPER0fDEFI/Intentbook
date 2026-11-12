import type { Metadata } from "next";
import { ActivityScreen } from "@/components/activity-screen";

export const metadata: Metadata = { title: "Activity", description: "Every fill on IntentBook with the result intents.near returned for it." };

export default function ActivityPage() {
  return <ActivityScreen />;
}
