"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart, formatPriceCents } from "@/lib/cart";
import { useInventoryAll } from "@/lib/inventory";
import NeedMoreModal from "@/components/NeedMoreModal";

export default function CartView() {
  const cart = useCart();
  const inv = useInventoryAll();
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needMore, setNeedMore] = useState<{ slug: string; name: string; qty: number } | null>(null);

  // Auto-clamp on every inventory tick: if a line item is over the live max,
  // pull it down to the cap so the customer can't accidentally check out
  // with stale data. Surfaces a warning row beneath.
  useEffect(() => {
    if (!cart.hydrated || inv.entries.size === 0) return;
    for (const it of cart.items) {
      const entry = inv.get(it.slug);
      if (!entry) continue;
      if (it.quantity > entry.max_in_cart) {
        cart.setQty(it.slug, Math.max(0, entry.max_in_cart));
      }
    }
  }, [inv.lastUpdated, cart, inv]);

  if (!cart.hydrated) {
    return <p className="mt-6 text-text-primary/70">Loading your cart…</p>;
  }

  if (cart.items.length === 0) {
    return (
      <div className="surface mt-6 p-6 text-text-primary/80">
        <p>Your cart is empty.</p>
        <Link href="/catalog" className="btn-primary mt-3 inline-flex">
          Browse the catalog →
        </Link>
      </div>
    );
  }

  // Are we over the live cap on anything? Used to gate Place-order.
  const overstockedLines = cart.items
    .map((it) => ({ it, entry: inv.get(it.slug) }))
    .filter(({ it, entry }) => entry && it.quantity > entry.max_in_cart);

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        items: cart.items.map((i) => ({
          variationId: i.variationId,
          quantity: i.quantity,
          slug: i.slug,
          kitchenProductId: i.slug,
          name: i.name,
          priceCents: i.priceCents,
        })),
        customer: { name, phone },
        pickupAt: pickupAt || undefined,
        notes: notes || undefined,
        flow: "cart",
      };
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // Server-side inventory re-validation (HTTP 409) — surface the detail
        // so the customer can lower quantity OR open the Need-More modal.
        if (res.status === 409 && Array.isArray(data?.oversold_items)) {
          inv.refresh(); // pull fresh inventory immediately
          setError(data?.error || "Some items are no longer available in the requested quantity.");
        } else {
          setError(data?.error || `HTTP ${res.status}`);
        }
        setSubmitting(false);
        return;
      }
      const orderId: string = data.orderId || data.order_id || "pending";
      try {
        sessionStorage.setItem(`hc-last-order-${orderId}`, JSON.stringify({ ...data, items: cart.items, customer: { name, phone }, pickupAt }));
      } catch {/* ignore */}
      cart.clear();
      router.push(`/confirmation/${encodeURIComponent(orderId)}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const checkoutDisabled = submitting || overstockedLines.length > 0;

  return (
    <div className="mt-6 space-y-8">
      {/* Line items */}
      <section aria-labelledby="lines">
        <h2 id="lines" className="sr-only">Items</h2>
        <ul className="m-0 list-none p-0 space-y-3">
          {cart.items.map((it) => {
            const entry = inv.get(it.slug);
            const max = entry?.max_in_cart ?? 99;
            const isAtCap = entry !== null && it.quantity >= max;
            const isOver = entry !== null && it.quantity > max;
            return (
              <li key={it.slug} className="surface flex flex-wrap items-center gap-3 p-3 sm:gap-4">
                <Link href={`/product/${it.slug}`} className="shrink-0 no-underline">
                  {it.imageUrl ? (
                    <img src={it.imageUrl} alt="" width={72} height={72} className="h-18 w-18 rounded object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded bg-cream-200" />
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/product/${it.slug}`} className="font-display text-lg leading-tight text-happy-blue-900 no-underline hover:text-happy-blue-700">
                    {it.name}
                  </Link>
                  <p className="m-0 text-sm text-text-primary/70">{formatPriceCents(it.priceCents)} each</p>
                </div>
                <div className="inline-flex items-center rounded-md border border-happy-blue-700/40 bg-cream-50">
                  <button
                    type="button"
                    onClick={() => cart.setQty(it.slug, it.quantity - 1)}
                    aria-label={`Decrease ${it.name}`}
                    className="inline-flex h-10 w-10 items-center justify-center text-xl text-happy-blue-700 hover:bg-happy-blue-200/40"
                  >−</button>
                  <span aria-live="polite" className="min-w-[2.25rem] px-1 text-center text-happy-blue-900">{it.quantity}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (it.quantity + 1 > max) {
                        setNeedMore({ slug: it.slug, name: it.name, qty: it.quantity + 1 });
                      } else {
                        cart.setQty(it.slug, Math.min(20, it.quantity + 1));
                      }
                    }}
                    aria-label={isAtCap ? `Want more ${it.name}? Talk to the team` : `Increase ${it.name}`}
                    title={isAtCap ? "That's all today's batch can handle — tap to talk to the team" : ""}
                    className={`inline-flex h-10 w-10 items-center justify-center text-xl ${
                      isAtCap
                        ? "text-text-primary/40 hover:bg-accent-coral/10"
                        : "text-happy-blue-700 hover:bg-happy-blue-200/40"
                    }`}
                  >+</button>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-medium text-happy-blue-900">{formatPriceCents(it.priceCents * it.quantity)}</div>
                  <button
                    type="button"
                    onClick={() => cart.remove(it.slug)}
                    className="mt-1 text-xs text-text-primary/60 underline hover:text-accent-coral"
                  >Remove</button>
                </div>
                {isOver && (
                  <p className="basis-full text-xs text-[#8E3320]">
                    ⚠ Today's batch can no longer cover this quantity — we trimmed it to what's available.{" "}
                    <button
                      type="button"
                      onClick={() => setNeedMore({ slug: it.slug, name: it.name, qty: it.quantity })}
                      className="underline"
                    >
                      Want more? Talk to the team
                    </button>
                  </p>
                )}
                {isAtCap && !isOver && (
                  <p className="basis-full text-xs text-text-primary/60">
                    That's the most of this we can promise today.{" "}
                    <button
                      type="button"
                      onClick={() => setNeedMore({ slug: it.slug, name: it.name, qty: it.quantity + 1 })}
                      className="underline text-happy-blue-700 hover:text-happy-blue-900"
                    >
                      Want more? Talk to the team
                    </button>
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-happy-blue-900/15 pt-3">
          <span className="text-text-primary/70">{cart.count} item{cart.count === 1 ? "" : "s"}</span>
          <span className="font-display text-2xl text-happy-blue-700">Subtotal {formatPriceCents(cart.total)}</span>
        </div>
      </section>

      {/* Customer + pickup */}
      <form onSubmit={placeOrder} className="surface space-y-4 p-6" aria-labelledby="checkout">
        <h2 id="checkout">Pickup details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Your name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
              className="w-full rounded-md border border-happy-blue-900/20 bg-white px-3 py-2 text-text-primary" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Phone (WhatsApp)</span>
            <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+1 832 …"
              className="w-full rounded-md border border-happy-blue-900/20 bg-white px-3 py-2 text-text-primary" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Pickup date &amp; time</span>
            <input required type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)}
              className="w-full rounded-md border border-happy-blue-900/20 bg-white px-3 py-2 text-text-primary" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200}
              placeholder="Allergies, occasion, message on top, gift…"
              className="w-full rounded-md border border-happy-blue-900/20 bg-white px-3 py-2 text-text-primary" />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-sm text-text-primary/70">
            Total: <strong>{formatPriceCents(cart.total)}</strong> · pickup at 350 Promenade Way Ste 500, Sugar Land
          </p>
          <button type="submit" disabled={checkoutDisabled} className="btn-primary disabled:opacity-50">
            {submitting ? "Placing order…" : overstockedLines.length > 0 ? "Adjust quantities first" : "Place pickup order"}
          </button>
        </div>

        {error && (
          <p role="alert" className="rounded-md border border-accent-coral/40 bg-accent-coral/10 px-3 py-2 text-sm text-[#8E3320]">
            {error}
          </p>
        )}
      </form>

      {needMore && (
        <NeedMoreModal
          open={true}
          onClose={() => setNeedMore(null)}
          productName={needMore.name}
          productSlug={needMore.slug}
          requestedQty={needMore.qty}
        />
      )}
    </div>
  );
}
