import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/contact — capture a customer contact request that the bot/cart
 * couldn't fulfil on its own (the most common case: bulk order beyond stock).
 *
 * The payload is forwarded verbatim to the operator's owner_bot via
 * LOCAL_AGENT_URL/escalations, which sends a Telegram alert to the owner with
 * the customer's phone + a wa.me deep link.
 *
 * Body shape (lenient):
 *   {
 *     kind: "bulk_request" | "callback_request" | "general_inquiry",
 *     customer: { name, phone },
 *     item?: { slug, name, requested_qty },
 *     message?: string
 *   }
 */
const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL?.replace(/\/$/, "");
const SITE_CHAT_TOKEN = process.env.SITE_CHAT_TOKEN ?? "";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const customer = (body.customer ?? {}) as { name?: string; phone?: string };
  if (!customer.name?.toString().trim() || !customer.phone?.toString().trim()) {
    return NextResponse.json(
      { error: "customer.name and customer.phone are required" },
      { status: 400 },
    );
  }

  const kind = (body.kind as string) || "general_inquiry";
  const item = body.item as { slug?: string; name?: string; requested_qty?: number } | undefined;
  const summary =
    kind === "bulk_request" && item
      ? `Bulk request: ${item.requested_qty}× ${item.name ?? item.slug}`
      : kind === "callback_request"
      ? `Callback requested by ${customer.name}`
      : `Contact form: ${customer.name}`;

  const escalation = {
    kind,
    summary,
    customer_label: `${customer.name} ${customer.phone}`,
    customer,
    item,
    message: body.message,
    submitted_at: new Date().toISOString(),
  };

  if (!LOCAL_AGENT_URL) {
    // Local dev / preview without the tunnel set: still acknowledge so the form
    // doesn't show an error to the customer; log on the server side.
    console.warn("/api/contact: LOCAL_AGENT_URL not set; escalation not forwarded", escalation);
    return NextResponse.json({ ok: true, deferred: true });
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    };
    if (SITE_CHAT_TOKEN) headers["x-site-chat-token"] = SITE_CHAT_TOKEN;
    const r = await fetch(`${LOCAL_AGENT_URL}/escalations`, {
      method: "POST",
      headers,
      body: JSON.stringify(escalation),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      return NextResponse.json({ ok: false, upstream_status: r.status, ...data }, { status: 502 });
    }
    const data = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 502 });
  }
}
