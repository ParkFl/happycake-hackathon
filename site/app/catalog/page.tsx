import type { Metadata } from "next";
import Link from "next/link";
import { listCatalog } from "@/lib/mcp";
import CakeCard from "@/components/CakeCard";
import JsonLd from "@/components/JsonLd";
import Breadcrumb from "@/components/Breadcrumb";
import BrandClose from "@/components/BrandClose";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Catalog — every HappyCake we bake",
  description:
    'The five SKUs from the HappyCake kitchen: whole and slice cake "Honey", cake "Pistachio Roll", custom birthday cake, office dessert box.',
  openGraph: { title: "HappyCake catalog", description: "All five HappyCake bakes." },
  alternates: { canonical: "/catalog" },
};

// Sort keeps anchor categories first so the grid reads from "today's bake" → catering → custom
const CATEGORY_ORDER: Record<string, number> = {
  "whole-cakes": 0,
  "slices": 1,
  "catering": 2,
  "custom": 3,
};

export default async function CatalogPage() {
  let catalog: Awaited<ReturnType<typeof listCatalog>> = [];
  try {
    catalog = await listCatalog();
  } catch {
    return (
      <div className="mx-auto max-w-page px-4 py-12">
        <h1>Catalog</h1>
        <p className="mt-4 text-text-primary/80">
          We&rsquo;re briefly offline reading the kitchen.{" "}
          <Link href="/">Try again from home →</Link>
        </p>
      </div>
    );
  }

  const sorted = [...catalog].sort(
    (a, b) =>
      (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
  );

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: sorted.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://happycake.us"}/product/${it.kitchenProductId}`,
      name: it.name,
    })),
  };

  return (
    <div className="mx-auto max-w-page px-4 py-12">
      <header className="mb-8">
        <Breadcrumb trail={[{ label: "Home", href: "/" }, { label: "Catalog" }]} />
        <h1 className="mt-2">The full HappyCake catalog</h1>
        <p className="mt-2 max-w-2xl text-text-primary/80">
          Five SKUs come out of our Sugar Land kitchen. Pickup is the default; whole bakes ask for a 24-hour lead, custom cakes need the team&rsquo;s OK before we start.
        </p>
        <p className="mt-1 text-sm text-text-primary/60">
          Each card is tagged with its category — by the slice · whole cake · catering · custom (24h).
        </p>
      </header>

      {/* Single unified grid — small categories don't get marooned on their own row.
          Category labels live on each card so navigation is still scannable. */}
      <ul className="m-0 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {sorted.map((item) => (
          <li key={item.id} className="m-0">
            <CakeCard item={item} />
          </li>
        ))}
      </ul>

      <BrandClose />

      <JsonLd data={itemListJsonLd} />
    </div>
  );
}
