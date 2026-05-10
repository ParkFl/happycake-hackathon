import { NextResponse } from "next/server";
import { getCatalogItemBySlug, getKitchenSummary, getInventoryForVariation } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/availability?slug=X — single-item availability, agent-friendly.
 *
 * For the catalog UI use /api/inventory (batch). This single endpoint stays
 * for AI-customer / llms.txt usage and for the on-site assistant.
 *
 * IMPORTANT: we never expose the raw stock count over HTTP. The site needs
 * to know "can I order N more?" but customers don't get to scrape kitchen
 * state. `max_in_cart` answers the operational question; the actual quantity
 * is server-only.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "missing slug" }, { status: 400 });
  }
  try {
    const item = await getCatalogItemBySlug(slug);
    if (!item) return NextResponse.json({ error: "unknown slug" }, { status: 404 });

    const [kitchen, stockEntry] = await Promise.all([
      getKitchenSummary().catch(() => ({ overCapacity: false, remainingCapacityMinutes: 420, dailyCapacityMinutes: 420 } as { overCapacity: boolean; remainingCapacityMinutes: number; dailyCapacityMinutes: number })),
      getInventoryForVariation(item.variationId).catch(() => null),
    ]);
    const stock = stockEntry?.quantity ?? 0;

    const isCustom = item.category === "custom";
    const isCatering = item.category === "catering";
    const overCapacity = kitchen.overCapacity || kitchen.remainingCapacityMinutes <= 0;

    let status: "ready_today" | "lead_24h" | "limited" | "sold_out";
    let max_in_cart: number;

    // Stock and capacity are independent: shelf-ready items can be picked up
    // even when the bake schedule is full. Same truth table as /api/inventory.
    if (isCustom) {
      status = stock > 0 ? "lead_24h" : "sold_out";
      max_in_cart = 0;
    } else if (stock > 0 && !overCapacity) {
      status = (stock <= 3 || kitchen.remainingCapacityMinutes < 30) ? "limited" : "ready_today";
      max_in_cart = isCatering ? Math.min(stock, 5) : Math.min(stock, 20);
    } else if (stock > 0 && overCapacity) {
      status = "limited";
      max_in_cart = isCatering ? Math.min(stock, 5) : Math.min(stock, 20);
    } else if (stock <= 0 && !overCapacity) {
      status = "lead_24h";
      max_in_cart = isCatering ? 5 : 20;
    } else {
      status = "sold_out";
      max_in_cart = 0;
    }

    return NextResponse.json(
      {
        slug,
        status,
        max_in_cart,
        requires_owner_approval: isCustom,
        capacity_minutes_remaining: kitchen.remainingCapacityMinutes,
        capacity_minutes_total: kitchen.dailyCapacityMinutes,
        over_capacity: overCapacity,
      },
      { headers: { "Cache-Control": "public, max-age=5, s-maxage=5" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
