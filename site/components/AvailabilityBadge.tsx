import { getKitchenSummary, getCatalogItemBySlug, getInventoryForVariation } from "@/lib/mcp";

/**
 * Server-rendered availability badge.
 *
 * We deliberately DO NOT show the raw stock count to customers — it would let
 * anyone scrape the kitchen state, and exact counts encourage haggling. We
 * only show the operational bucket:
 *   "Ready today" · "24h lead" · "Limited today — pre-order for tomorrow" · "Sold out today"
 *
 * The site's cart uses the live /api/inventory poll (every 7s) to clamp the
 * quantity stepper. That's where the actual count lives, server-side.
 */
export default async function AvailabilityBadge({ slug }: { slug: string }) {
  let label = "Check availability";
  let tone: "ready" | "lead" | "limited" | "soldout" = "ready";

  try {
    const item = await getCatalogItemBySlug(slug);
    const isCustom = item?.category === "custom";
    const isCatering = item?.category === "catering";

    const [kitchen, inventory] = await Promise.all([
      getKitchenSummary().catch(() => null),
      item ? getInventoryForVariation(item.variationId).catch(() => null) : Promise.resolve(null),
    ]);

    const stock = inventory?.quantity ?? null;
    const overCap = !!(kitchen && (kitchen.overCapacity || kitchen.remainingCapacityMinutes <= 0));

    // Truth table — stock and capacity are independent dimensions:
    //   stock>0 + cap OK   → ready / limited
    //   stock>0 + over cap → "On the counter — no fresh batch today"
    //   stock=0 + cap OK   → 24h lead
    //   stock=0 + over cap → truly sold out for today
    if (isCustom) {
      label = stock !== null && stock <= 0 ? "Sold out today" : "24h lead — owner approval";
      tone = stock !== null && stock <= 0 ? "soldout" : "lead";
    } else if (isCatering) {
      label = stock !== null && stock <= 0 ? "Sold out today — order for tomorrow" : "24h lead — book ahead";
      tone = stock !== null && stock <= 0 ? "soldout" : "lead";
    } else if (stock !== null && stock <= 0 && overCap) {
      label = "Sold out today — order for tomorrow";
      tone = "soldout";
    } else if (stock !== null && stock <= 0) {
      label = "24h lead — pre-order for tomorrow";
      tone = "lead";
    } else if (overCap) {
      // Stock on the counter, but bake schedule is full.
      label = "On the counter — no fresh batch today";
      tone = "limited";
    } else if (stock !== null && stock <= 3) {
      label = "Limited — last few today";
      tone = "limited";
    } else if (kitchen && kitchen.remainingCapacityMinutes < 30) {
      label = "Slots filling — order soon";
      tone = "limited";
    } else {
      label = "Ready today";
      tone = "ready";
    }
  } catch {
    label = "Check availability";
  }

  const toneClass =
    tone === "ready"
      ? "bg-accent-green/15 text-[#2D5538] border-accent-green/40"
      : tone === "lead"
      ? "bg-cream-200/60 text-text-primary border-text-primary/30"
      : tone === "limited"
      ? "bg-accent-coral/15 text-[#8E3320] border-accent-coral/40"
      : "bg-accent-coral/25 text-[#6B2418] border-accent-coral/60";

  return (
    <span
      className={`inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium ${toneClass}`}
      role="status"
      aria-live="polite"
    >
      {label}
    </span>
  );
}
