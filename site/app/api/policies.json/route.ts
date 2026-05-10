import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET() {
  return NextResponse.json(
    {
      pickup: {
        location: "Sugar Land, TX 77479",
        hours: {
          tue_sat: { open: "10:00", close: "19:00" },
          sun: { open: "10:00", close: "16:00" },
          mon: "closed",
        },
        same_day_lead_minutes: 0,
        full_bake_lead_hours: 24,
      },
      delivery: {
        local_only: true,
        radius_miles: 15,
        min_qty_for_delivery: 3,
      },
      allergens: {
        common: ["wheat", "egg", "milk", "tree-nuts (walnut, pistachio)"],
        gluten_free: false,
        nut_free: false,
        notes:
          "Our kitchen handles wheat, eggs, dairy, and tree nuts (walnut, pistachio). We are not a nut-free or gluten-free facility. Cross-contact is possible.",
      },
      custom_orders: {
        owner_approval_required: true,
        lead_time_hours: 24,
        max_message_length: 60,
        offered: ["text on top", "color of plain frosting"],
        not_offered: ["fondant figurines", "multi-tier", "edible photo prints"],
      },
      gift_orders: {
        hide_price: true,
        recipient_replaces_customer_for_delivery: true,
      },
      refunds: {
        offer:
          "If you're unhappy with the cake, tell us within 24h with a photo. We replace, refund, or send a fresh cake — the team decides per case.",
        owner_approval_required: true,
      },
      payment: {
        methods_accepted: ["card at pickup", "Apple Pay", "Google Pay"],
        invoicing: { available: true, terms: "Net-30 for office accounts" },
      },
      contact: {
        whatsapp: "+1-281-555-0100",
        site_chat: true,
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
