import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listCatalog, formatPrice } from "@/lib/mcp";
import { brandedName } from "@/components/CakeCard";
import { imageForSlug, HERO_IMAGES } from "@/lib/assets";
import AvailabilityBadge from "@/components/AvailabilityBadge";
import JsonLd from "@/components/JsonLd";
import BrandClose from "@/components/BrandClose";

export const revalidate = 60;

type CampaignSpec = {
  headline: string;
  subhead: string;
  productSlug: string;
  offerLine: string;
  hero: string;
  utmDefault: { source: string; medium: string };
};

const CAMPAIGNS: Record<string, CampaignSpec> = {
  "mothers-day-honey": {
    headline: "For Mom. Whole cake \"Honey\", baked Saturday.",
    subhead: "Six layers, soft custard between every one, walnuts on top — Sugar Land's classic.",
    productSlug: "whole-honey-cake",
    offerLine: "10% off whole cake \"Honey\" pre-orders for Mother's Day weekend.",
    hero: HERO_IMAGES[0],
    utmDefault: { source: "instagram", medium: "paid_social" },
  },
  "office-friday": {
    headline: "Friday office treat, sorted in two clicks.",
    subhead: "Office dessert box — assorted, ready Friday morning, comfortable for a 12-person team.",
    productSlug: "office-dessert-box",
    offerLine: "Reserve a Friday slot — pickup or local delivery within 15 miles.",
    hero: HERO_IMAGES[1],
    utmDefault: { source: "google_local", medium: "search" },
  },
  "weekend-pistachio": {
    headline: 'cake "Pistachio Roll" — small, weekend, walk-in.',
    subhead: "Premium pistachio dessert, by the slice, for the Saturday counter.",
    productSlug: "pistachio-roll",
    offerLine: "On the counter Saturday — first come, first served.",
    hero: HERO_IMAGES[2],
    utmDefault: { source: "instagram", medium: "organic" },
  },
  "valentines-honey": {
    headline: "Bake the day a little sweeter.",
    subhead: 'Whole cake "Honey" for Valentine\'s — six layers of golden honey biscuit, soft custard, walnuts on top.',
    productSlug: "whole-honey-cake",
    offerLine: "Reserve through Feb 14 — pickup all weekend.",
    hero: HERO_IMAGES[3],
    utmDefault: { source: "instagram", medium: "paid_social" },
  },
  "nauryz-honey": {
    headline: 'Nauryz on the table — cake "Honey".',
    subhead: 'The same recipe our families baked at home. Bring spring to the table.',
    productSlug: "whole-honey-cake",
    offerLine: "Order 24 hours ahead so we can bake to you, not from stock.",
    hero: HERO_IMAGES[0],
    utmDefault: { source: "instagram", medium: "organic" },
  },
  "eid-honey": {
    headline: 'For your Eid table.',
    subhead: 'Whole cake "Honey" — generous, classic, packs neatly for the family gathering.',
    productSlug: "whole-honey-cake",
    offerLine: "Reserve early — Eid weekend fills up fast.",
    hero: HERO_IMAGES[1],
    utmDefault: { source: "instagram", medium: "paid_social" },
  },
  "fathers-day-honey": {
    headline: 'For Dad — the original taste of happiness.',
    subhead: 'Whole cake "Honey" for Father\'s Day. Same recipe, same kitchen, same warmth.',
    productSlug: "whole-honey-cake",
    offerLine: "Pickup through Sunday — no fuss, just a good cake.",
    hero: HERO_IMAGES[2],
    utmDefault: { source: "instagram", medium: "organic" },
  },
  "thanksgiving-office": {
    headline: 'A Thanksgiving treat for the team.',
    subhead: 'Office dessert box — assorted, generous, ready before the long weekend starts.',
    productSlug: "office-dessert-box",
    offerLine: "Reserve by Tuesday for Wednesday pickup.",
    hero: HERO_IMAGES[3],
    utmDefault: { source: "google_local", medium: "search" },
  },
  "christmas-honey": {
    headline: 'A Christmas cake with no shortcuts.',
    subhead: 'Whole cake "Honey" for the holiday table. Same recipe as the day we opened.',
    productSlug: "whole-honey-cake",
    offerLine: "Pickup Dec 22–24 — pre-order so we bake to you.",
    hero: HERO_IMAGES[0],
    utmDefault: { source: "instagram", medium: "paid_social" },
  },
  "back-to-school-office": {
    headline: "First day, sorted with cake.",
    subhead: 'Office dessert box for the school staff lounge or the team that\'s starting the new year.',
    productSlug: "office-dessert-box",
    offerLine: "August pickup — let us know the school day and we'll have it ready.",
    hero: HERO_IMAGES[1],
    utmDefault: { source: "google_local", medium: "search" },
  },
};

export async function generateStaticParams() {
  return Object.keys(CAMPAIGNS).map((campaign_slug) => ({ campaign_slug }));
}

export async function generateMetadata({ params }: { params: { campaign_slug: string } }): Promise<Metadata> {
  const c = CAMPAIGNS[params.campaign_slug];
  if (!c) return { title: "Campaign not found" };
  return {
    title: c.headline,
    description: c.subhead,
    openGraph: { title: c.headline, description: c.subhead, images: [{ url: c.hero }] },
    alternates: { canonical: `/c/${params.campaign_slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: { campaign_slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const c = CAMPAIGNS[params.campaign_slug];
  if (!c) notFound();

  let item;
  try {
    item = (await listCatalog()).find((it) => it.kitchenProductId === c.productSlug);
  } catch {
    item = undefined;
  }
  if (!item) notFound();

  const utm = {
    source: (searchParams["utm_source"] as string) ?? c.utmDefault.source,
    medium: (searchParams["utm_medium"] as string) ?? c.utmDefault.medium,
    campaign: (searchParams["utm_campaign"] as string) ?? params.campaign_slug,
  };

  const orderHref =
    `/order/${c.productSlug}` +
    `?campaign=${encodeURIComponent(utm.campaign)}` +
    `&src=${encodeURIComponent(utm.source)}` +
    `&med=${encodeURIComponent(utm.medium)}`;

  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://happycake.us";
  const offerJsonLd = {
    "@context": "https://schema.org",
    "@type": "Offer",
    name: c.headline,
    description: c.offerLine,
    price: (item.priceCents / 100).toFixed(2),
    priceCurrency: "USD",
    url: `${SITE}/c/${params.campaign_slug}`,
    availability: "https://schema.org/InStock",
    seller: { "@type": "Organization", name: "HappyCake" },
  };

  return (
    <>
      <section className="bg-cream-100/50">
        <div className="mx-auto grid max-w-page items-center gap-8 px-4 py-12 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-happy-blue-700">Limited offer</p>
            <h1>{c.headline}</h1>
            <p className="mt-3 text-lg text-text-primary/80">{c.subhead}</p>
            <p className="mt-4 surface inline-block px-4 py-2 text-sm">{c.offerLine}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={orderHref} className="btn-primary">
                Order now — {formatPrice(item.priceCents)}
              </Link>
              <Link href={`/product/${c.productSlug}`} className="btn-secondary">More about this cake</Link>
              <AvailabilityBadge slug={c.productSlug} />
            </div>
            <p className="mt-3 text-xs text-text-primary/60">
              Tracking: utm_campaign=<code>{utm.campaign}</code> · utm_source=<code>{utm.source}</code> · utm_medium=<code>{utm.medium}</code>
            </p>
          </div>
          <div>
            <img src={c.hero} alt={brandedName(item)} width={1600} height={1000} className="rounded-md object-cover" />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-page px-4 pb-12">
        <BrandClose />
      </div>
      <JsonLd data={offerJsonLd} />
    </>
  );
}
