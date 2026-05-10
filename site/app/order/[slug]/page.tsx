import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalogItemBySlug, formatPrice, type CatalogItem } from "@/lib/mcp";
import { brandedName } from "@/components/CakeCard";
import OrderForm from "./OrderForm";
import Breadcrumb from "@/components/Breadcrumb";

export const revalidate = 60;

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const item = await getCatalogItemBySlug(params.slug).catch(() => undefined);
  if (!item) return { title: "Order — not found" };
  return {
    title: `Order — ${brandedName(item)}`,
    description: `Pickup order for ${brandedName(item)} from HappyCake, Sugar Land.`,
    alternates: { canonical: `/order/${params.slug}` },
    robots: { index: false, follow: true },
  };
}

export default async function OrderPage({ params }: { params: { slug: string } }) {
  let item: CatalogItem | undefined;
  try {
    item = await getCatalogItemBySlug(params.slug);
  } catch {
    item = undefined;
  }
  if (!item) notFound();

  // Decide initial flow from the slug
  const initialFlow: "birthday" | "office" | "gift" | "custom" =
    item.category === "custom"
      ? "custom"
      : item.category === "catering"
      ? "office"
      : "birthday";

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Breadcrumb
        trail={[
          { label: "Home", href: "/" },
          { label: "Catalog", href: "/catalog" },
          { label: brandedName(item), href: `/product/${params.slug}` },
          { label: "Order" },
        ]}
      />
      <div className="mb-4" />

      <header className="mb-6">
        <h1>Order {brandedName(item)}</h1>
        <p className="mt-2 text-text-primary/80">
          {formatPrice(item.priceCents)} · {item.description}
        </p>
      </header>

      <OrderForm
        slug={params.slug}
        variationId={item.variationId}
        productName={brandedName(item)}
        priceCents={item.priceCents}
        category={item.category}
        initialFlow={initialFlow}
      />

    </article>
  );
}
