import type { Metadata } from "next";
import Breadcrumb from "@/components/Breadcrumb";
import Confirmation from "./Confirmation";

export const metadata: Metadata = {
  title: "Order confirmed",
  description: "HappyCake order confirmation.",
  robots: { index: false, follow: false },
};

export default function ConfirmationPage({ params }: { params: { orderId: string } }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Breadcrumb trail={[{ label: "Home", href: "/" }, { label: "Cart", href: "/cart" }, { label: "Confirmation" }]} />
      <Confirmation orderId={decodeURIComponent(params.orderId)} />
    </article>
  );
}
