"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPriceCents } from "@/lib/cart";

type Stash = {
  orderId?: string;
  status?: string;
  message?: string;
  readyAt?: string;
  items?: Array<{ slug: string; name: string; quantity: number; priceCents: number; imageUrl?: string }>;
  customer?: { name?: string; phone?: string };
  pickupAt?: string;
  ticket_id?: string;
  estimated_ready_at?: string;
};

export default function Confirmation({ orderId }: { orderId: string }) {
  const [stash, setStash] = useState<Stash | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`hc-last-order-${orderId}`);
      if (raw) setStash(JSON.parse(raw));
    } catch {/* ignore */}
    setHydrated(true);
  }, [orderId]);

  const total = stash?.items?.reduce((s, i) => s + i.priceCents * i.quantity, 0) ?? 0;
  const itemCount = stash?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const pendingApproval = stash?.status === "pending_owner_approval" || stash?.status === "pending_owner_confirmation";
  // Friendlier short reference: ord_abc123 → #ABC123; idem_4c598527dbfd → #4C59-8527
  const friendlyRef = (() => {
    const tail = orderId.replace(/^(ord_|idem_)/, "");
    if (tail.length >= 8) return "#" + tail.slice(0, 4).toUpperCase() + "-" + tail.slice(4, 8).toUpperCase();
    return "#" + tail.toUpperCase();
  })();

  return (
    <div className="mt-2 space-y-6">
      <header>
        <h1 className="text-happy-blue-700">
          {pendingApproval ? "Sent to the team for confirmation" : "Order confirmed"}
        </h1>
        <p className="mt-2 text-text-primary/80">
          {pendingApproval
            ? (stash?.message ?? "Custom and large orders need a quick yes from the team. We'll text you back within the hour.")
            : (stash?.message ?? "We'll text you on WhatsApp when your order is ready. Pickup at 350 Promenade Way Ste 500, Sugar Land.")}
        </p>
        <p className="mt-2 text-sm text-text-primary/70">
          Reference <strong>{friendlyRef}</strong>
          {!pendingApproval && stash?.estimated_ready_at && (
            <> · ready {new Date(stash.estimated_ready_at).toLocaleString()}</>
          )}
        </p>
        <p className="mt-1 text-xs text-text-primary/40">
          Internal id: <code className="rounded bg-cream-100 px-1.5 py-0.5">{orderId}</code>
        </p>
      </header>

      {hydrated && stash?.items && stash.items.length > 0 && (
        <section aria-labelledby="items" className="surface p-4">
          <h2 id="items" className="m-0 text-lg">Order summary</h2>
          <ul className="m-0 mt-3 list-none p-0 divide-y divide-happy-blue-900/10">
            {stash.items.map((it) => (
              <li key={it.slug} className="flex items-center gap-3 py-2">
                {it.imageUrl ? (
                  <img src={it.imageUrl} alt="" width={48} height={48} className="h-12 w-12 rounded object-cover" />
                ) : <div className="h-12 w-12 rounded bg-cream-200" />}
                <div className="flex-1 min-w-0">
                  <p className="m-0 truncate text-text-primary">{it.name}</p>
                  <p className="m-0 text-xs text-text-primary/60">
                    {it.quantity} × {formatPriceCents(it.priceCents)}
                  </p>
                </div>
                <div className="font-medium text-happy-blue-900">
                  {formatPriceCents(it.priceCents * it.quantity)}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-happy-blue-900/15 pt-3">
            <span className="text-text-primary/70">{itemCount} item{itemCount === 1 ? "" : "s"}</span>
            <span className="font-display text-xl text-happy-blue-700">Total {formatPriceCents(total)}</span>
          </div>
        </section>
      )}

      {hydrated && stash?.customer && (
        <section className="surface p-4 text-sm" aria-labelledby="pickup">
          <h2 id="pickup" className="m-0 text-lg">Pickup</h2>
          <dl className="m-0 mt-2 grid gap-2 sm:grid-cols-2">
            <div><dt className="text-text-primary/60">Name</dt><dd className="m-0">{stash.customer.name}</dd></div>
            <div><dt className="text-text-primary/60">Phone</dt><dd className="m-0">{stash.customer.phone}</dd></div>
            {stash.pickupAt && (
              <div><dt className="text-text-primary/60">Pickup</dt><dd className="m-0">{new Date(stash.pickupAt).toLocaleString()}</dd></div>
            )}
            {stash.estimated_ready_at && (
              <div><dt className="text-text-primary/60">Estimated ready</dt><dd className="m-0">{new Date(stash.estimated_ready_at).toLocaleString()}</dd></div>
            )}
          </dl>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/catalog" className="btn-secondary">Browse the catalog</Link>
        <a href="https://wa.me/12819798320" className="btn-secondary" target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>
      </div>

      <p className="text-xs text-text-primary/60">
        Order on the site at happycake.us or send a message on WhatsApp.<br />— the HappyCake team
      </p>
    </div>
  );
}
