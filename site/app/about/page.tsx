import type { Metadata } from "next";
import Breadcrumb from "@/components/Breadcrumb";
import BrandClose from "@/components/BrandClose";

export const metadata: Metadata = {
  title: "About — the small Sugar Land kitchen behind HappyCake",
  description:
    "HappyCake is a Kazakhstan-rooted bakery; our first US location opened in Sugar Land in summer 2024. We hand-bake classic cakes from a working family recipe book.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <Breadcrumb trail={[{ label: "Home", href: "/" }, { label: "About" }]} />
      <p className="eyebrow mt-3">HappyCake · Sugar Land</p>
      <h1 className="mt-2">It started with one phrase: &ldquo;It&rsquo;s just like homemade.&rdquo;</h1>

      <p className="mt-6 text-lg text-text-primary/80">
        We started baking cakes. As if for ourselves — delicious, sweet, fresh. People kept coming back saying &ldquo;it tastes like I baked it myself&rdquo;. That homemade taste became the centre of what we wanted to make.
      </p>

      <p className="mt-3 text-text-primary/80">
        Every ingredient is carefully selected. Every cake is hand-decorated and hand-packed. Every recipe was perfected over years until it earned its name. When customers choose our cakes for the moments that matter — birthdays, anniversaries, the quiet week-night dinner — our hearts cheer and sink at once. That mix of pride and responsibility is what keeps us improving every day.
      </p>

      <section className="mt-10 space-y-6">
        <h2>What we stand for</h2>
        <ul className="m-0 list-none space-y-4 p-0">
          <li className="surface p-4">
            <strong className="font-display text-lg text-happy-blue-700">Open and honest.</strong>
            <p className="m-0 mt-1 text-text-primary/80 text-sm">
              We share the wins and the imperfect days. We don&rsquo;t delete negative comments — we answer them.
            </p>
          </li>
          <li className="surface p-4">
            <strong className="font-display text-lg text-happy-blue-700">Creating value.</strong>
            <p className="m-0 mt-1 text-text-primary/80 text-sm">
              A cake is more than a cake. It&rsquo;s emotion, care, and warmth. Every detail of the order, the box, the slice, the moment — counts.
            </p>
          </li>
          <li className="surface p-4">
            <strong className="font-display text-lg text-happy-blue-700">Confident.</strong>
            <p className="m-0 mt-1 text-text-primary/80 text-sm">
              We work daily on the only thing that matters: making sure the cake will be delicious. Confidence comes from the work, not from talking about the work.
            </p>
          </li>
          <li className="surface p-4">
            <strong className="font-display text-lg text-happy-blue-700">Happy.</strong>
            <p className="m-0 mt-1 text-text-primary/80 text-sm">
              HappyCake is not HappyCake unless it brings happiness and joy. Every cake we make is a chance to add a brighter moment to someone&rsquo;s day.
            </p>
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2>What we are — and what we&rsquo;re not</h2>
        <p>
          <strong>We are not a candy store.</strong> We sell traditional, time-tested cakes — the kind handed down through families. People come to us looking for a reliable taste of celebration, not for exotic flavours of the week.
        </p>
        <p>
          <strong>We are not a custom-cake shop.</strong> Decoration is a small, optional service via our Custom birthday cake item. Our offering is the ready-made line — proven recipes, consistent quality, instant availability.
        </p>
        <p>
          <strong>We are not exclusive.</strong> HappyCake is for families who care about traditional values, who prefer substance over presentation. Our customers eat the cake at dinner and remember it later.
        </p>
        <p>
          <strong>We are enthusiastic professionals.</strong> Everyone at HappyCake — from the kitchen to the counter — actually loves HappyCake cakes. It shows up in every detail.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2>Where we are</h2>
        <p>
          350 Promenade Way, Suite 500, Sugar Land, TX 77478. Tue–Sat 11 AM–7 PM, Sun 12 PM–6 PM, closed Mondays. Phone <a href="tel:+12819798320">(281) 979-8320</a>. Find us on <a href="https://www.instagram.com/happycake.us/" target="_blank" rel="noopener noreferrer">Instagram @happycake.us</a>.
        </p>
        <p>
          Sugar Land is a multicultural Houston suburb — Anglo, Hispanic, South Asian, East Asian, Central Asian diaspora, Middle Eastern. We are a neighbourhood place that competes with the kitchen, not with the bakery across town. Most of our customers either live within ten miles or work nearby.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2>What you&rsquo;ll find on the counter</h2>
        <p>
          Five bakes available right now: whole and slice cake &ldquo;Honey&rdquo;, cake &ldquo;Pistachio Roll&rdquo;, custom birthday cakes (24-hour lead, owner approval), and an office dessert box for catering. Behind the counter we keep a working book of 30+ time-tested recipes — the daily bake rotates with what makes sense for the season and what the team felt like making that morning.
        </p>
      </section>

      <BrandClose />
    </article>
  );
}
