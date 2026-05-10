import Link from "next/link";

export default function BrandFooter() {
  return (
    <footer className="bg-happy-blue-900 text-cream-50">
      <div className="mx-auto max-w-page px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          <section>
            <h3 className="text-cream-50 font-display text-xl">HappyCake</h3>
            <p className="mt-2 text-sm text-cream-100/80">
              Kazakhstan-rooted bakery, opened in Sugar Land summer 2024. Classic cakes hand-decorated daily from a working family recipe book.
            </p>
            <p className="mt-3 text-sm">
              <a
                href="https://www.instagram.com/happycake.us/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center min-h-[44px] py-2 text-cream-100 hover:text-cream-50"
              >
                Instagram @happycake.us →
              </a>
            </p>
          </section>
          <section aria-labelledby="visit">
            <h3 id="visit" className="text-cream-50 font-display text-xl">Visit &amp; pickup</h3>
            <address className="mt-2 not-italic text-sm text-cream-100/80">
              <span className="block break-words">350 Promenade Way, Suite 500</span>
              <span className="block">Sugar Land, TX 77478</span>
              <a
                href="tel:+12819798320"
                className="mt-2 inline-flex items-center min-h-[44px] py-2 text-cream-100 hover:text-cream-50"
              >
                (281) 979-8320
              </a>
            </address>
            <ul className="mt-2 list-none p-0 text-sm text-cream-100/80">
              <li className="py-0.5">Tue–Sat · 11 AM – 7 PM</li>
              <li className="py-0.5">Sun · 12 PM – 6 PM</li>
              <li className="py-0.5">Mon · closed</li>
            </ul>
          </section>
          <section aria-labelledby="links">
            <h3 id="links" className="text-cream-50 font-display text-xl">Site</h3>
            <ul className="mt-2 list-none p-0 text-sm">
              <li>
                <Link
                  href="/catalog"
                  className="inline-flex items-center min-h-[44px] py-2 text-cream-100 hover:text-cream-50"
                >Catalog</Link>
              </li>
              <li>
                <Link
                  href="/policies"
                  className="inline-flex items-center min-h-[44px] py-2 text-cream-100 hover:text-cream-50"
                >Pickup, allergens, refund</Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="inline-flex items-center min-h-[44px] py-2 text-cream-100 hover:text-cream-50"
                >About</Link>
              </li>
              <li>
                <a
                  href="/llms.txt"
                  className="inline-flex items-center min-h-[44px] py-2 text-cream-100 hover:text-cream-50"
                >For AI agents (llms.txt)</a>
              </li>
            </ul>
          </section>
        </div>
        <div className="mt-8 border-t border-cream-100/20 pt-4 text-xs text-cream-100/60">
          © {new Date().getFullYear()} HappyCake · 350 Promenade Way Ste 500, Sugar Land, TX 77478 · Order on the site at happycake.us or send a message on WhatsApp.
        </div>
      </div>
    </footer>
  );
}
