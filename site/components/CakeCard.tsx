import Link from "next/link";
import Image from "next/image";
import type { CatalogItem } from "@/lib/mcp";
import { formatPrice } from "@/lib/mcp";
import { imageForSlug } from "@/lib/assets";
import AvailabilityBadge from "./AvailabilityBadge";

/** Brandbook formatting for the iconic two cakes; everything else uses catalog name verbatim. */
export function brandedName(item: CatalogItem): string {
  if (item.kitchenProductId === "whole-honey-cake") return 'cake "Honey" (whole)';
  if (item.kitchenProductId === "honey-cake-slice") return 'cake "Honey" (slice)';
  if (item.kitchenProductId === "pistachio-roll") return 'cake "Pistachio Roll"';
  return item.name;
}

const CATEGORY_LABEL: Record<string, string> = {
  "whole-cakes": "Whole cake",
  "slices": "By the slice",
  "catering": "Catering",
  "custom": "Custom · 24h",
};

export default function CakeCard({ item }: { item: CatalogItem }) {
  const slug = item.kitchenProductId;
  const img = imageForSlug(slug);
  const categoryLabel = CATEGORY_LABEL[item.category] ?? item.category;
  return (
    <article className="surface flex h-full flex-col overflow-hidden">
      <Link href={`/product/${slug}`} className="relative block no-underline">
        <Image
          src={img}
          alt={`${brandedName(item)} — ${item.description}`}
          width={1200}
          height={1200}
          loading="lazy"
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="aspect-square w-full object-cover"
        />
        <span className="absolute left-2 top-2 inline-flex items-center rounded-sm border border-happy-blue-900/15 bg-cream-50/90 px-2 py-0.5 text-[11px] font-medium text-happy-blue-900 backdrop-blur">
          {categoryLabel}
        </span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg leading-tight m-0">
            <Link
              href={`/product/${slug}`}
              className="inline-flex items-center min-h-[44px] no-underline text-happy-blue-900 hover:text-happy-blue-700"
            >
              {brandedName(item)}
            </Link>
          </h3>
          <span className="whitespace-nowrap font-display text-xl text-happy-blue-700 mt-2">
            {formatPrice(item.priceCents)}
          </span>
        </div>
        <p className="text-sm text-text-primary/80 line-clamp-2 m-0">{item.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <AvailabilityBadge slug={slug} />
          <Link href={`/product/${slug}`} className="btn-primary text-sm ml-auto">
            View
          </Link>
        </div>
      </div>
    </article>
  );
}
