/**
 * BrandClose — the standard brandbook §2.3.8 closing block.
 * Used at the bottom of every customer-facing page so the "soft CTA" rule
 * is consistent across home / catalog / policies / campaign landings.
 *
 * Per brandbook: lowercase `cake`, sign as people, no shouting.
 */
export default function BrandClose({ tone = "default" }: { tone?: "default" | "muted" }) {
  const cls =
    tone === "muted"
      ? "mt-12 border-t border-happy-blue-900/15 pt-6 text-sm text-text-primary/60"
      : "mt-12 rounded-md bg-cream-100 border border-happy-blue-900/10 p-6 text-text-primary/80";
  return (
    <aside aria-label="Close" className={cls}>
      <p className="m-0">
        Order on the site at <a href="/catalog" className="font-medium">happycake.us</a> or send a message on{" "}
        <a href="https://wa.me/12819798320" target="_blank" rel="noopener noreferrer" className="font-medium">WhatsApp</a>.
      </p>
      <p className="m-0 mt-1 text-text-primary/60">— the HappyCake team</p>
    </aside>
  );
}
