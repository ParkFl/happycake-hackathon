import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCatalogItemBySlug,
  listCatalog,
  formatPrice,
  type CatalogItem,
} from "@/lib/mcp";
import { imageForSlug } from "@/lib/assets";
import Image from "next/image";
import AvailabilityBadge from "@/components/AvailabilityBadge";
import JsonLd from "@/components/JsonLd";
import Breadcrumb from "@/components/Breadcrumb";
import { brandedName } from "@/components/CakeCard";
import AddToCartButton from "@/components/AddToCartButton";

export const revalidate = 60;

export async function generateStaticParams() {
  try {
    const items = await listCatalog();
    return items.map((it) => ({ slug: it.kitchenProductId }));
  } catch {
    return [];
  }
}

export async function generateMetadata(
  { params }: { params: { slug: string } },
): Promise<Metadata> {
  const item = await getCatalogItemBySlug(params.slug).catch(() => undefined);
  if (!item) return { title: "Cake not found" };
  const name = brandedName(item);
  const desc = item.description;
  return {
    title: `${name} — ${formatPrice(item.priceCents)}`,
    description: desc,
    openGraph: { title: name, description: desc, images: [{ url: imageForSlug(params.slug) }] },
    alternates: { canonical: `/product/${params.slug}` },
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  let item: CatalogItem | undefined;
  try {
    item = await getCatalogItemBySlug(params.slug);
  } catch {
    item = undefined;
  }
  if (!item) notFound();

  const name = brandedName(item);
  const img = imageForSlug(params.slug);
  const isCustom = item.category === "custom";
  const isCatering = item.category === "catering";

  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://happycake.us";
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: item.description,
    image: img,
    offers: {
      "@type": "Offer",
      price: (item.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      availability: isCustom ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
      url: `${SITE}/product/${params.slug}`,
      seller: { "@type": "Organization", name: "HappyCake" },
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Catalog", item: `${SITE}/catalog` },
      { "@type": "ListItem", position: 3, name, item: `${SITE}/product/${params.slug}` },
    ],
  };

  return (
    <article className="mx-auto max-w-page px-4 py-12">
      <Breadcrumb
        trail={[
          { label: "Home", href: "/" },
          { label: "Catalog", href: "/catalog" },
          { label: name },
        ]}
      />
      <div className="mb-4" />

      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Image
            src={img}
            alt={`${name} — ${item.description}`}
            width={1200}
            height={1200}
            priority
            fetchPriority="high"
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="aspect-square w-full rounded-md object-cover"
          />
        </div>

        <div>
          <h1 className="mb-2">{name}</h1>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="font-display text-3xl text-happy-blue-700">{formatPrice(item.priceCents)}</span>
            <AvailabilityBadge slug={params.slug} />
          </div>
          <p className="text-text-primary/80">{item.description}</p>

          {isCustom && (
            <p className="mt-4 surface inline-block px-4 py-3 text-sm">
              Custom cakes need the team&rsquo;s OK before we start. Send your message and pickup time below — we&rsquo;ll confirm within the hour.
            </p>
          )}
          {isCatering && (
            <p className="mt-4 surface inline-block px-4 py-3 text-sm">
              Office and catering orders use a dedicated form so we can confirm headcount, pickup or delivery, and billing preference.
            </p>
          )}

          <div className="mt-6">
            <AddToCartButton
              slug={params.slug}
              variationId={item.variationId}
              name={name}
              priceCents={item.priceCents}
              category={item.category}
              imageUrl={img}
            />
            <div className="mt-3">
              <Link href="/policies#allergens" className="btn-secondary">Allergens &amp; policies</Link>
            </div>
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-text-primary/60">Category</dt>
              <dd className="font-medium">{item.category}</dd>
            </div>
            <div>
              <dt className="text-text-primary/60">Pickup lead</dt>
              <dd className="font-medium">{isCustom || isCatering ? "24 hours" : "Same day"}</dd>
            </div>
            <div>
              <dt className="text-text-primary/60">Owner approval</dt>
              <dd className="font-medium">{isCustom ? "Required" : "Not needed"}</dd>
            </div>
            <div>
              <dt className="text-text-primary/60">Allergens</dt>
              <dd className="font-medium"><Link href="/policies#allergens">See policies</Link></dd>
            </div>
          </dl>
        </div>
      </div>

      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
    </article>
  );
}
