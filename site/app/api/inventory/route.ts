import { NextResponse } from "next/server";
import {
  listCatalog,
  getInventory,
  getKitchenSummary,
  type CatalogItem,
} from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/inventory — live availability for every SKU, polled by the cart UI
 * every ~7 seconds. We DO NOT expose raw stock counts (so customers can't
 * scrape the kitchen state); we only expose:
 *   - status: human-friendly bucket
 *   - max_in_cart: hard cap the cart UI uses to clamp the quantity stepper
 *
 * Caps applied in addition to actual stock:
 *   - custom-category items: 0 (must use custom-cake form, owner approval)
 *   - catering items: ≤ 5 (event-scale, owner often confirms anyway)
 *   - normal items: ≤ 20 (above that is a bulk inquiry, route to owner)
 *
 * Capacity vs stock — these are two different things:
 *   - `kitchen.overCapacity = true` means the bake schedule for today is full.
 *     We can't ADD more bakes, but the SKUs already on the shelf can still be
 *     picked up. So overCapacity ≠ sold_out for items with stock > 0.
 *   - `stock = 0` means the shelf is empty.
 *
 * Truth table:
 *   stock>0 + cap OK   → ready_today
 *   stock>0 + over cap → limited      (no fresh batch today; grab from shelf)
 *   stock=0 + cap OK   → lead_24h     (we'll bake to your order)
 *   stock=0 + over cap → sold_out     (no shelf, no slot — try tomorrow)
 */

type Status = "ready_today" | "lead_24h" | "limited" | "sold_out";

type Entry = {
  slug: string;
  variationId: string;
  category: string;
  status: Status;
  max_in_cart: number;
  is_custom: boolean;
};

function computeEntry(item: CatalogItem, stock: number, kitchen: { overCapacity: boolean; remainingCapacityMinutes: number }): Entry {
  const isCustom = item.category === "custom";
  const isCatering = item.category === "catering";
  const overCap = kitchen.overCapacity || kitchen.remainingCapacityMinutes <= 0;

  let status: Status;
  let max_in_cart: number;

  // Customer-facing truth table — shelf wins:
  //   stock > 0           → ready_today (don't expose kitchen state to customer)
  //   stock = 0 + cap OK  → lead_24h
  //   stock = 0 + over cap → sold_out
  if (isCustom) {
    // Custom MUST go through the owner-approval form — max_in_cart=0 always.
    status = stock > 0 ? "lead_24h" : "sold_out";
    max_in_cart = 0;
  } else if (stock > 0) {
    status = "ready_today";
    max_in_cart = isCatering ? Math.min(stock, 5) : Math.min(stock, 20);
  } else if (!overCap) {
    status = "lead_24h";
    max_in_cart = isCatering ? 5 : 20;
  } else {
    status = "sold_out";
    max_in_cart = 0;
  }

  return {
    slug: item.kitchenProductId,
    variationId: item.variationId,
    category: item.category,
    status,
    max_in_cart,
    is_custom: isCustom,
  };
}

export async function GET() {
  try {
    const catalog = await listCatalog();
    const variationIds = catalog.map((c) => c.variationId);
    const [inventoryCounts, kitchen] = await Promise.all([
      getInventory(variationIds),
      getKitchenSummary().catch(() => ({ overCapacity: false, remainingCapacityMinutes: 420, dailyCapacityMinutes: 420 } as { overCapacity: boolean; remainingCapacityMinutes: number; dailyCapacityMinutes: number })),
    ]);
    const stockByVariation = new Map(inventoryCounts.map((c) => [c.variationId, c.quantity]));

    const entries: Entry[] = catalog.map((item) =>
      computeEntry(item, stockByVariation.get(item.variationId) ?? 0, kitchen),
    );

    return NextResponse.json(
      { entries, generated_at: new Date().toISOString() },
      {
        // 5s server-side cache so the 7s client poll doesn't hammer MCP unnecessarily.
        headers: { "Cache-Control": "public, max-age=5, s-maxage=5" },
      },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? "MCP unavailable" }, { status: 502 });
  }
}
