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
  let tone: "ready" | "lead" | "soldout" = "ready";

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

    // Customer-friendly truth table:
    //   stock > 0           → "Ready today" (don't tell them about kitchen state)
    //   stock = 0 + cap OK  → "24h lead — pre-order for tomorrow"
    //   stock = 0 + over cap → "Sold out today — order for tomorrow"
    //   custom: always 24h lead unless stock = 0
    if (isCustom) {
      label = stock !== null && stock <= 0 ? "Sold out today" : "24h lead — owner approval";
      tone = stock !== null && stock <= 0 ? "soldout" : "lead";
    } else if (stock !== null && stock > 0) {
      label = "Ready today";
      tone = "ready";
    } else if (stock !== null && stock <= 0 && overCap) {
      label = "Sold out today — order for tomorrow";
      tone = "soldout";
    } else if (stock !== null && stock <= 0) {
      label = "24h lead — pre-order for tomorrow";
      tone = "lead";
    } else {
      // stock unknown (MCP error); be honest, not pessimistic
      label = "Check availability";
      tone = "lead";
    }
  } catch {
    label = "Check availability";
  }

  const toneClass =
    tone === "ready"
      ? "bg-accent-green/15 text-[#2D5538] border-accent-green/40"
      : tone === "lead"
      ? "bg-cream-200/60 text-text-primary border-text-primary/30"
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
