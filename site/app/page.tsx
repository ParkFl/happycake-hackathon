import Link from "next/link";
import Image from "next/image";
import { listCatalog, formatPrice } from "@/lib/mcp";
import { pickDailyHero } from "@/lib/assets";
import CakeCard from "@/components/CakeCard";
import BrandClose from "@/components/BrandClose";

export const revalidate = 60; // re-render homepage every minute

export default async function HomePage() {
  const hero = pickDailyHero();
  let catalog: Awaited<ReturnType<typeof listCatalog>> = [];
  try {
    catalog = await listCatalog();
  } catch {
    catalog = [];
  }

  const featured = catalog.filter((c) =>
    ["whole-honey-cake", "pistachio-roll", "office-dessert-box"].includes(c.kitchenProductId)
  );

  return (
    <>
      <section className="bg-cream-50">
        <div className="mx-auto grid max-w-page items-center gap-8 px-4 py-12 sm:py-16 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <p className="eyebrow mb-3">HappyCake · Sugar Land</p>
            <h1>The original taste of happiness.</h1>
            <p className="mt-4 max-w-xl text-lg text-text-primary/80">
              Hand-baked classic cakes from our Sugar Land kitchen — same recipes the HappyCake team has been baking since the day we opened.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/order/whole-honey-cake" className="btn-primary">Order today&rsquo;s bake</Link>
              <Link href="/catalog" className="btn-secondary">See the full catalog</Link>
            </div>
            <p className="mt-3 text-sm text-text-primary/60">
              350 Promenade Way Ste 500, Sugar Land · Tue–Sat 11–7, Sun 12–6 · 24h lead for custom
            </p>
          </div>
          <div className="order-1 lg:order-2">
            <Image
              src={hero}
              alt={'Whole cake "Honey" — six layers of golden honey biscuit, soft custard between every one, walnuts on top.'}
              width={1600}
              height={1000}
              priority
              fetchPriority="high"
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="h-auto w-full rounded-md object-cover"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="featured" className="bg-cream-100/40">
        <div className="mx-auto max-w-page px-4 py-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <h2 id="featured">Today&rsquo;s bake</h2>
            <Link href="/catalog" className="text-sm">All cakes →</Link>
          </div>
          {featured.length === 0 ? (
            <p className="text-text-primary/70">
              The catalog is loading. <Link href="/catalog">Open the full catalog →</Link>
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((item) => (
                <CakeCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-cream-50">
        <div className="mx-auto grid max-w-page gap-8 px-4 py-12 sm:grid-cols-3">
          <article>
            <h3>Same-day pickup</h3>
            <p className="mt-2 text-text-primary/80 text-sm">
              What&rsquo;s on the counter today goes home today. Whole bakes have a 24-hour lead so the layers set properly.
            </p>
          </article>
          <article>
            <h3>Five SKUs, no surprises</h3>
            <p className="mt-2 text-text-primary/80 text-sm">
              Whole cake &ldquo;Honey&rdquo; · slice cake &ldquo;Honey&rdquo; · cake &ldquo;Pistachio Roll&rdquo; · custom birthday cake (24h, owner approval) · office dessert box.
              {catalog.length > 0 && <>&nbsp;Whole cake &ldquo;Honey&rdquo; is {formatPrice(catalog.find((c) => c.kitchenProductId === "whole-honey-cake")?.priceCents ?? 0)}.</>}
            </p>
          </article>
          <article>
            <h3>Talk to a person</h3>
            <p className="mt-2 text-text-primary/80 text-sm">
              The chat in the corner is staffed by our HappyCake assistant. For owner-only conversations,{" "}
              <a href="https://wa.me/12819798320">drop a WhatsApp</a>.
            </p>
          </article>
        </div>
        <div className="polka-divider mx-auto max-w-page" aria-hidden />
        <div className="mx-auto max-w-page px-4 pb-12">
          <BrandClose />
        </div>
      </section>
    </>
  );
}
