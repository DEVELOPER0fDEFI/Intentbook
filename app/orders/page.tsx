import type { Metadata } from "next";
import { OrdersScreen } from "@/components/orders-screen";

export const metadata: Metadata = { title: "Your orders" };

export default function OrdersPage() {
  return <OrdersScreen />;
}
