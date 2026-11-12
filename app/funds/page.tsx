import type { Metadata } from "next";
import { FundsScreen } from "@/components/funds-screen";

export const metadata: Metadata = { title: "Funds" };

export default function FundsPage() {
  return <FundsScreen />;
}
