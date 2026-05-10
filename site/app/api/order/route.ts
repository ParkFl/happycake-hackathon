import { NextResponse } from "next/server";
import { createHash } from "crypto";
import {
  createOrder,
  createKitchenTicket,
  getKitchenSummary,
  getCatalogItemBySlug,
  getInventory,
  listCatalog,
  type CatalogItem,
} from "@/lib/mcp";

export const runtime = "nodejs";

/**
 * POST /api/order — accepts BOTH single-item and multi-item (cart) payloads.
 *
 * Cart shape (preferred):
 *   {
 *     items: [{ variationId, quantity, slug?, kitchenProductId? }, …],
 *     customer: { name, phone },
 *     pickupAt?: ISO datetime,
 *     notes?: string,
 *     flow?: "cart"
 *   }
 *
 * Single-item (legacy /order/[slug] form):
 *   {
 *     flow: "birthday|office|gift|custom",
 *     slug, variationId, quantity?, customer:{name,phone}, ...
 *   }
 *
 * Hard gates:
 *   - Any item in `custom` category routes to owner approval queue (no order created).
 *   - Multi-item order whose total prep > remaining capacity escalates to owner.
 */

type CartItemIn = {
  variationId: string;
  quantity?: number;
  slug?: string;
  kitchenProductId?: string;
};

type OrderRequest = {
  flow?: string;
  customer?: { name?: string; phone?: string };
  pickupAt?: string;
  notes?: string;
  // multi
  items?: CartItemIn[];
  // single
  slug?: string;
  variationId?: string;
  quantity?: number;
  messageOnTop?: string;
  office?: { headcount: number; deliveryMode: "pickup" | "delivery"; deliveryAddress?: string; billing: "card" | "invoice" };
  gift?: { recipientName: string; recipientAddress: string; giftNote?: string; hidePrice: boolean };
};

function idemKey(seed: string): string {
  return "idem_" + createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

async function escalate(req: Request, body: Record<string, unknown>) {
  try {
    await fetch(new URL("/api/escalation", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {/* best-effort */}
}

export async function POST(req: Request) {
  let payload: OrderRequest;
  try {
    payload = (await req.json()) as OrderRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const customerName = payload.customer?.name?.trim();
  const customerPhone = payload.customer?.phone?.trim();
  if (!customerName || !customerPhone) {
    return NextResponse.json({ error: "customer.name and customer.phone are required" }, { status: 400 });
  }

  // Resolve the catalog so we can check categories + map kitchen product ids.
  let catalog: CatalogItem[];
  try {
    catalog = await listCatalog();
  } catch (e) {
    return NextResponse.json({ error: `catalog unavailable: ${(e as Error).message}` }, { status: 502 });
  }
  const byVariation = new Map(catalog.map((c) => [c.variationId, c]));

  // ---------- Multi-item (cart checkout) ----------
  if (Array.isArray(payload.items) && payload.items.length > 0) {
    const items = payload.items.map((i) => ({ variationId: i.variationId, quantity: Math.max(1, Math.min(20, Number(i.quantity) || 1)) }));

    // Hard gate 1: no custom-category items in cart
    const customRow = items.find((it) => byVariation.get(it.variationId)?.category === "custom");
    if (customRow) {
      return NextResponse.json({
        status: "rejected",
        error: "Custom cakes need owner approval — please order them via the dedicated custom form.",
      }, { status: 400 });
    }

    // Hard gate 2: live inventory re-validation. The cart UI clamps via
    // /api/inventory polled every 7s, but we re-check on the server because
    // (a) clients can be tampered with and (b) stock may have moved between
    // the last poll and the click on "Place pickup order".
    try {
      const inv = await getInventory(items.map((i) => i.variationId));
      const stockBy = new Map(inv.map((c) => [c.variationId, c.quantity]));
      const overstock = items
        .map((it) => {
          const stock = stockBy.get(it.variationId) ?? 0;
          const item = byVariation.get(it.variationId);
          return { it, stock, item };
        })
        .filter(({ it, stock }) => it.quantity > stock);
      if (overstock.length > 0) {
        const detail = overstock
          .map(({ it, stock, item }) => `${item?.name ?? it.variationId}: requested ${it.quantity}, only ${stock} available today`)
          .join("; ");
        return NextResponse.json({
          status: "rejected",
          error: `Today's batch can't cover the cart — ${detail}. Lower the quantity, or message the team to arrange tomorrow's bake.`,
          oversold_items: overstock.map(({ it }) => it.variationId),
        }, { status: 409 });
      }
    } catch {/* if inventory MCP fails, trust the cart UI clamp and fall through */}

    // Capacity check (rough: 25 min per cake item)
    let escalation: string | null = null;
    try {
      const k = await getKitchenSummary();
      const requestedMinutes = items.reduce((s, it) => s + 25 * it.quantity, 0);
      if (requestedMinutes > k.remainingCapacityMinutes) {
        escalation = `Cart total prep ${requestedMinutes}min > remaining capacity ${k.remainingCapacityMinutes}min — owner needed.`;
      }
    } catch {/* if capacity unknown, fall through */}

    if (escalation) {
      const idemSeed = `cart|${customerPhone}|${items.map((i) => i.variationId + ":" + i.quantity).join(",")}|${payload.pickupAt ?? ""}`;
      await escalate(req, { kind: "office_order_over_capacity", payload, summary: escalation });
      return NextResponse.json({
        status: "pending_owner_approval",
        orderId: idemKey(idemSeed),
        message: escalation,
      });
    }

    try {
      const created = await createOrder({
        items,
        customerName,
        customerPhone,
      });
      const order = created.order;

      // One kitchen ticket per item (the simulator accepts that pattern).
      const ticketResults: string[] = [];
      for (const it of items) {
        const cat = byVariation.get(it.variationId);
        if (!cat) continue;
        try {
          const ticket = await createKitchenTicket({
            orderId: order.id,
            customerName,
            items: [{ productId: cat.kitchenProductId, quantity: it.quantity }],
          });
          ticketResults.push(ticket.ticketId);
        } catch {/* not fatal — kitchen automator can re-pick this up later */}
      }

      return NextResponse.json({
        status: order.status,
        orderId: order.id,
        ticketIds: ticketResults,
        message: `Order ${order.id} confirmed. We'll text you when it's ready.`,
      });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  // ---------- Single-item (legacy /order/[slug] form) ----------
  if (!payload.slug || !payload.variationId) {
    return NextResponse.json({ error: "either items[] or {slug, variationId} is required" }, { status: 400 });
  }
  const item = await getCatalogItemBySlug(payload.slug).catch(() => undefined);
  if (!item) return NextResponse.json({ error: "unknown product slug" }, { status: 404 });
  const quantity = Math.max(1, Math.min(20, Number(payload.quantity) || 1));

  if (payload.flow === "custom" || item.category === "custom") {
    await escalate(req, {
      kind: "custom_order_pending_owner_approval",
      slug: payload.slug,
      // variationId + kitchen_product_id are needed by the owner-bot's
      // approval handler to actually create the Square order + kitchen ticket.
      variationId: payload.variationId,
      kitchen_product_id: item.kitchenProductId,
      customer: payload.customer,
      channel: "site_chat",
      quantity,
      messageOnTop: payload.messageOnTop,
      pickupAt: payload.pickupAt,
      flow: payload.flow,
    });
    return NextResponse.json({
      status: "pending_owner_approval",
      orderId: idemKey(`custom|${customerPhone}|${payload.slug}|${payload.pickupAt ?? ""}`),
      message: `Custom order draft sent to the team for confirmation. We'll get back by phone within the hour.`,
    });
  }

  if (payload.flow === "office" || quantity >= 3) {
    try {
      const k = await getKitchenSummary();
      if (quantity * 25 > k.remainingCapacityMinutes) {
        await escalate(req, { kind: "office_order_over_capacity", ...(payload as Record<string, unknown>) });
        return NextResponse.json({
          status: "pending_owner_confirmation",
          orderId: idemKey(`office|${customerPhone}|${payload.slug}|${payload.pickupAt ?? ""}`),
          message: `Office order received — the team is checking capacity. We'll confirm in ~30 min.`,
        });
      }
    } catch {/* fall through */}
  }

  try {
    const created = await createOrder({
      items: [{ variationId: payload.variationId, quantity }],
      customerName,
      customerPhone,
    });
    if (created.kitchenTool === "kitchen_create_ticket") {
      try {
        await createKitchenTicket({
          orderId: created.order.id,
          customerName,
          items: [{ productId: item.kitchenProductId, quantity }],
        });
      } catch {/* not fatal */}
    }
    return NextResponse.json({
      status: created.order.status,
      orderId: created.order.id,
      message: `Order ${created.order.id} confirmed. We'll text you when it's ready.`,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
