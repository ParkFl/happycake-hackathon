import { NextResponse } from "next/server";
import { listCatalog } from "@/lib/mcp";

export const revalidate = 60;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://happycake.us";

export async function GET() {
  try {
    const items = await listCatalog();
    const out = items.map((it) => ({
      slug: it.kitchenProductId,
      name: it.name,
      category: it.category,
      price_usd: it.priceCents / 100,
      price_cents: it.priceCents,
      description: it.description,
      requires_owner_approval: it.category === "custom",
      lead_time_hours: it.category === "custom" || it.category === "catering" ? 24 : 0,
      url: `${SITE}/product/${it.kitchenProductId}`,
      order_url: `${SITE}/order/${it.kitchenProductId}`,
    }));
    return NextResponse.json(out, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "MCP unavailable" },
      { status: 502 },
    );
  }
}
