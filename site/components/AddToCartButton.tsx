"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart, formatPriceCents } from "@/lib/cart";
import { useInventory } from "@/lib/inventory";
import NeedMoreModal from "./NeedMoreModal";

type Props = {
  slug: string;
  variationId: string;
  name: string;
  priceCents: number;
  category?: string;
  imageUrl?: string;
};

/**
 * Quantity stepper + Add to cart, with a HARD CAP from live inventory.
 *
 * The stepper never lets the in-cart qty go above `max_in_cart` reported by
 * the InventoryProvider (polled every 7s). Click [+] beyond the cap → opens
 * the NeedMoreModal so the customer can talk to the team instead of failing
 * silently.
 *
 * For custom-category items we route to the dedicated /order/<slug> flow
 * which gates through owner approval — so cart isn't a fit there.
 */
export default function AddToCartButton({ slug, variationId, name, priceCents, category, imageUrl }: Props) {
  const cart = useCart();
  const inventory = useInventory(slug);
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [needMoreOpen, setNeedMoreOpen] = useState(false);

  if (category === "custom") {
    return (
      <Link href={`/order/${slug}`} className="btn-primary">
        Request custom — owner confirms
      </Link>
    );
  }

  const inCart = cart.items.find((i) => i.slug === slug)?.quantity ?? 0;
  const inventoryReady = inventory !== null;
  const max = inventory?.max_in_cart ?? 1; // sane default while inventory loads
  const remainingHeadroom = Math.max(0, max - inCart);
  const isSoldOut = inventoryReady && max <= 0;
  const canIncrement = qty + inCart < max;

  function handleIncrement() {
    if (canIncrement) {
      setQty((q) => q + 1);
    } else {
      // Already at the cap → ask the team instead
      setNeedMoreOpen(true);
    }
  }

  function handleAdd() {
    if (qty + inCart > max) {
      setNeedMoreOpen(true);
      return;
    }
    cart.add({ slug, variationId, name, priceCents, category, imageUrl }, qty);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  }

  if (isSoldOut) {
    return (
      <div className="space-y-3">
        <button type="button" disabled className="btn-primary disabled:opacity-50">
          Sold out today
        </button>
        <button
          type="button"
          onClick={() => setNeedMoreOpen(true)}
          className="block text-sm text-happy-blue-700 underline hover:text-happy-blue-900"
        >
          Want this for tomorrow? Tell the team →
        </button>
        <NeedMoreModal
          open={needMoreOpen}
          onClose={() => setNeedMoreOpen(false)}
          productName={name}
          productSlug={slug}
          requestedQty={1}
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-md border border-happy-blue-700/40 bg-cream-50">
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
            className="inline-flex h-11 w-11 items-center justify-center text-xl text-happy-blue-700 hover:bg-happy-blue-200/40 disabled:opacity-40"
            disabled={qty <= 1}
          >
            −
          </button>
          <span aria-live="polite" className="min-w-[2.5rem] px-1 text-center font-medium text-happy-blue-900">
            {qty}
          </span>
          <button
            type="button"
            onClick={handleIncrement}
            aria-label={canIncrement ? "Increase quantity" : "Want more? Talk to the team"}
            title={canIncrement ? "Add one more" : "That's all today's batch can handle — tap to ask the team"}
            className={`inline-flex h-11 w-11 items-center justify-center text-xl ${
              canIncrement
                ? "text-happy-blue-700 hover:bg-happy-blue-200/40"
                : "text-text-primary/40 hover:bg-accent-coral/10"
            }`}
          >
            +
          </button>
        </div>

        <button type="button" onClick={handleAdd} className="btn-primary">
          Add to cart · {formatPriceCents(priceCents * qty)}
        </button>

        {justAdded && (
          <span role="status" aria-live="polite" className="text-sm text-accent-green">
            ✓ Added — <Link href="/cart" className="underline">view cart</Link>
          </span>
        )}
        {!justAdded && inCart > 0 && (
          <span className="text-sm text-text-primary/70">
            Already in cart: {inCart} · <Link href="/cart" className="underline">view</Link>
          </span>
        )}
      </div>

      {/* Soft hint when we're at the limit but not yet "sold out" */}
      {inventoryReady && !canIncrement && remainingHeadroom === 0 && inCart > 0 && (
        <p className="mt-2 text-xs text-text-primary/70">
          That's the most of this we can promise today.{" "}
          <button
            type="button"
            onClick={() => setNeedMoreOpen(true)}
            className="underline text-happy-blue-700 hover:text-happy-blue-900"
          >
            Want more? Talk to the team
          </button>
          .
        </p>
      )}

      <NeedMoreModal
        open={needMoreOpen}
        onClose={() => setNeedMoreOpen(false)}
        productName={name}
        productSlug={slug}
        requestedQty={Math.max(qty + inCart, max + 1, 1)}
      />
    </>
  );
}
