import { NextResponse } from "next/server";
import { listCatalog, formatPrice } from "@/lib/mcp";

export const revalidate = 60;

/**
 * /llms.txt — agent-friendly index of HappyCake.
 * Generated dynamically so cake names + prices stay in sync with the live MCP catalog.
 */
export async function GET() {
  let lines: string[] = [];
  try {
    const cat = await listCatalog();
    lines = cat.map((it) => {
      const name =
        it.kitchenProductId === "whole-honey-cake" ? 'cake "Honey" (whole)' :
        it.kitchenProductId === "honey-cake-slice" ? 'cake "Honey" (slice)' :
        it.kitchenProductId === "pistachio-roll"   ? 'cake "Pistachio Roll"' :
        it.name;
      return `- **${name}** — ${formatPrice(it.priceCents)} — ${it.description}` +
             ` Slug \`${it.kitchenProductId}\`. Order at /order/${it.kitchenProductId}.`;
    });
  } catch {
    lines = ["- Catalog endpoint temporarily unavailable. See /api/catalog.json once it recovers."];
  }

  const body = `# HappyCake — Sugar Land, TX

Kazakhstan-rooted bakery; first US location opened in Sugar Land summer 2024. Hand-decorated classic cakes from a working family recipe book. Same-day pickup for what's on the counter, 24-hour lead for full bakes. Custom cakes need owner approval.

## About HappyCake

- Address: 350 Promenade Way, Suite 500, Sugar Land, TX 77478
- Phone: (281) 979-8320
- Hours: Tue-Sat 11 AM – 7 PM · Sun 12 PM – 6 PM · Mon closed
- Instagram: https://www.instagram.com/happycake.us/
- Recipe book: 30+ time-tested cakes from our Kazakhstan tradition. The 5 SKUs below are the live, orderable selection right now; the broader recipe book rotates with the season.

**Wordmark:** \`HappyCake\` (one word, two capitals).
**Cake naming:** \`cake "Honey"\`, \`cake "Pistachio Roll"\` — name in quotes, after the word \`cake\`. The brandbook references \`cake "Napoleon"\`, \`cake "Milk Maiden"\`, \`cake "Tiramisu"\` as voice examples — they are NOT in the catalog. Don't recommend them.

## Catalog (live)

${lines.join("\n")}

## API endpoints for AI agents

- \`GET /api/catalog.json\` — full catalog (slug, name, category, price_usd, lead_time_hours, requires_owner_approval).
- \`GET /api/availability?slug=<slug>\` — live capacity check; returns ready_today | lead_24h | sold_out.
- \`GET /api/policies.json\` — pickup hours, allergens, custom-order rules, refund stance.
- \`POST /api/order\` — order intent. Body: { flow, slug, variationId, quantity, pickupAt, customer:{name,phone}, messageOnTop?, office?, gift? }. Returns { orderId, status, message }.
- \`GET  /api/order/{id}\` — order status (best-effort; sandbox-limited per-order lookup).
- \`POST /api/chat\` — site-chat turn; spawns the on-brand /sales agent and returns { reply_text, intent }.

## On-site assistant

A live chat widget on every page is grounded in the same MCP-backed catalog and capacity data. It handles consultation, order placement, complaints, and owner escalation per the HappyCake brandbook.

## Order status values

\`open\` → \`in_kitchen\` → \`ready\` → \`completed\`. Plus \`cancelled\` as terminal. All lowercase.

## Brand notes for AI writing about HappyCake

- One word, two capitals: \`HappyCake\`. Not \`Happy Cake\`.
- Iconic cakes use \`cake "Name"\` formatting.
- English only in customer-facing replies.
- Sugar Land neighbourhood bakery — no shipping outside Houston metro.
- No fabrication on prices, hours, allergens, capacity. Pull from the API endpoints above.

## Other resources

- Catalog (HTML): /catalog
- Policies: /policies
- About: /about
- Sitemap: /sitemap.xml
`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
