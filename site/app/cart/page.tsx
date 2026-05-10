import type { Metadata } from "next";
import Breadcrumb from "@/components/Breadcrumb";
import CartView from "./CartView";

export const metadata: Metadata = {
  title: "Your cart",
  description: "Review your HappyCake order, edit quantities, and place a pickup order.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/cart" },
};

export default function CartPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Breadcrumb trail={[{ label: "Home", href: "/" }, { label: "Cart" }]} />
      <h1 className="mt-2">Your cart</h1>
      <p className="mt-2 text-text-primary/80">
        Edit quantities, review totals, then pickup at our Sugar Land kitchen.
      </p>
      <CartView />
    </article>
  );
}
