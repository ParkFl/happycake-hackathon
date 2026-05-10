import type { Metadata } from "next";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import BrandClose from "@/components/BrandClose";

export const metadata: Metadata = {
  title: "Policies — pickup, lead times, allergens, refunds",
  description: "HappyCake pickup hours, lead times, allergen statement, gift handling, and refund approach.",
  alternates: { canonical: "/policies" },
};

export default function PoliciesPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Breadcrumb trail={[{ label: "Home", href: "/" }, { label: "Policies" }]} />
      <h1 className="mt-2">Policies</h1>
      <p className="mt-2 text-text-primary/80">
        Plain answers to the questions you&rsquo;re likely to ask. The same data is at <a href="/api/policies.json"><code>/api/policies.json</code></a> for AI agents.
      </p>

      <section className="mt-8" aria-labelledby="pickup">
        <h2 id="pickup">Pickup & hours</h2>
        <ul>
          <li>350 Promenade Way, Suite 500, Sugar Land, TX 77478.</li>
          <li>Tue–Sat 11 AM – 7 PM · Sun 12 PM – 6 PM · Mon closed.</li>
          <li>Phone: <a href="tel:+12819798320">(281) 979-8320</a> · Instagram <a href="https://www.instagram.com/happycake.us/" target="_blank" rel="noopener noreferrer">@happycake.us</a>.</li>
          <li>Same-day pickup for what&rsquo;s already on the counter.</li>
          <li>Whole bakes need 24 hours so the layers set.</li>
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="delivery">
        <h2 id="delivery">Delivery</h2>
        <p>Local delivery only, within 15 miles of Sugar Land. Minimum 3 cakes per delivery run.</p>
      </section>

      <section className="mt-8" aria-labelledby="allergens">
        <h2 id="allergens">Allergens</h2>
        <p>
          Our kitchen handles <strong>wheat, eggs, dairy, and tree nuts (walnut, pistachio)</strong>.
          We are not a nut-free or gluten-free facility — cross-contact is possible. If you have
          a serious allergy, message the team directly on WhatsApp before ordering.
        </p>
      </section>

      <section className="mt-8" aria-labelledby="custom">
        <h2 id="custom">Custom orders</h2>
        <ul>
          <li>24-hour lead time, owner approval before we start.</li>
          <li>Up to 60 characters of plain text on top.</li>
          <li>Frosting color choice is offered.</li>
          <li>We don&rsquo;t do fondant figurines, multi-tier, or edible photo prints.</li>
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="gifts">
        <h2 id="gifts">Gifts</h2>
        <p>
          When &ldquo;Send as a gift&rdquo; is checked, the price is hidden in the box. Recipient details
          replace the buyer&rsquo;s for delivery questions; the buyer still gets pickup or delivery confirmations.
        </p>
      </section>

      <section className="mt-8" aria-labelledby="refunds">
        <h2 id="refunds">Refunds & remedies</h2>
        <p>
          If something&rsquo;s wrong with the cake, tell us within 24 hours with a photo.
          We replace, refund, or send a fresh cake — the team decides per case.
          No quoting policy at the customer; just doing the right thing.
        </p>
      </section>

      <section className="mt-8" aria-labelledby="payment">
        <h2 id="payment">Payment</h2>
        <p>Card at pickup, Apple Pay, Google Pay. Net-30 invoicing for office accounts.</p>
      </section>

      <section className="mt-8" aria-labelledby="contact">
        <h2 id="contact">Contact</h2>
        <p>
          Shop phone <a href="tel:+12819798320">(281) 979-8320</a> · WhatsApp <a href="https://wa.me/12819798320">message us</a> · or use the chat in the corner.
        </p>
      </section>

      <BrandClose />
    </article>
  );
}
