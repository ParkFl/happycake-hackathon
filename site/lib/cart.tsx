"use client";

/**
 * site/lib/cart.tsx — client-side shopping cart context.
 *
 * State lives in React context + sessionStorage so it survives same-tab
 * page navigation. Tab close clears it (intentional — anonymous customers).
 *
 * Custom-category items (cake "Custom birthday cake") are NOT addable here:
 * they require owner approval via the /order/custom-birthday-cake flow.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  slug: string;             // kitchenProductId
  variationId: string;      // sq_var_*
  name: string;             // display name (already brandbook-formatted)
  priceCents: number;
  quantity: number;
  imageUrl?: string;
  category?: string;
};

type CartCtx = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  setQty: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  clear: () => void;
  total: number;            // total in cents
  count: number;            // total quantity across items
  hydrated: boolean;        // false on first render before sessionStorage read
};

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = "hc-cart-v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from sessionStorage once on mount
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch {
      /* corrupt storage — start fresh */
    }
    setHydrated(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* quota / private mode */
    }
  }, [items, hydrated]);

  const add = useCallback((item: Omit<CartItem, "quantity">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.slug === item.slug);
      if (existing) {
        return prev.map((p) =>
          p.slug === item.slug ? { ...p, quantity: p.quantity + qty } : p
        );
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const setQty = useCallback((slug: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((p) => p.slug !== slug)
        : prev.map((p) => (p.slug === slug ? { ...p, quantity: qty } : p))
    );
  }, []);

  const remove = useCallback((slug: string) => {
    setItems((prev) => prev.filter((p) => p.slug !== slug));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const total = useMemo(
    () => items.reduce((s, i) => s + i.priceCents * i.quantity, 0),
    [items]
  );
  const count = useMemo(
    () => items.reduce((s, i) => s + i.quantity, 0),
    [items]
  );

  const value = useMemo<CartCtx>(
    () => ({ items, add, setQty, remove, clear, total, count, hydrated }),
    [items, add, setQty, remove, clear, total, count, hydrated]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCart must be used inside <CartProvider>");
  return v;
}

export function formatPriceCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
