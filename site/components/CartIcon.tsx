"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

/**
 * Header cart link with a count badge. Hidden when the cart is empty AND not yet
 * hydrated (avoids a flash on first paint), shown afterward as a 44px tap target.
 */
export default function CartIcon() {
  const { count, hydrated } = useCart();
  const showBadge = hydrated && count > 0;

  return (
    <Link
      href="/cart"
      className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 text-happy-blue-700 hover:text-happy-blue-900 no-underline"
      aria-label={showBadge ? `Cart with ${count} item${count === 1 ? "" : "s"}` : "Cart"}
    >
      {/* Cart SVG — pure inline so no icon dep */}
      <svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
        <path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h8.5a2 2 0 0 0 2-1.6L21.5 8H6" />
      </svg>
      {showBadge && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-coral px-1 text-[11px] font-bold leading-none text-cream-50"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
