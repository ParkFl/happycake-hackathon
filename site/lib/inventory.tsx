"use client";

/**
 * site/lib/inventory.tsx — client-side inventory context with 7-second polling.
 *
 * Exposes per-slug `status` + `max_in_cart`. The raw stock count never crosses
 * the wire (server caps it inside /api/inventory). UI just gets the operational
 * facts it needs:
 *   - status: ready_today | lead_24h | limited | sold_out
 *   - max_in_cart: integer cap for the qty stepper. 0 means "block".
 *
 * Polling cadence is intentionally short (7s) so a stock change at the kitchen
 * (a walk-in customer, a marketing burst) is reflected in the cart UI before
 * a customer can over-order.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type InventoryStatus = "ready_today" | "lead_24h" | "limited" | "sold_out";

export type InventoryEntry = {
  slug: string;
  variationId: string;
  category: string;
  status: InventoryStatus;
  max_in_cart: number;
  is_custom: boolean;
};

type InventoryCtx = {
  entries: Map<string, InventoryEntry>;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  get: (slug: string) => InventoryEntry | null;
  refresh: () => void;
};

const Ctx = createContext<InventoryCtx | null>(null);
const POLL_MS = 7000;

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Map<string, InventoryEntry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const inFlight = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { entries?: InventoryEntry[] };
      const map = new Map<string, InventoryEntry>();
      for (const e of data.entries ?? []) map.set(e.slug, e);
      setEntries(map);
      setLastUpdated(Date.now());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    return () => clearInterval(id);
  }, [fetchOnce]);

  const get = useCallback((slug: string) => entries.get(slug) ?? null, [entries]);

  const value = useMemo<InventoryCtx>(
    () => ({ entries, loading, error, lastUpdated, get, refresh: fetchOnce }),
    [entries, loading, error, lastUpdated, get, fetchOnce],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInventory(slug?: string): InventoryEntry | null {
  const v = useContext(Ctx);
  if (!v) return null; // graceful: render with no constraints if provider missing
  if (!slug) return null;
  return v.get(slug);
}

export function useInventoryAll(): InventoryCtx {
  const v = useContext(Ctx);
  if (!v) {
    return {
      entries: new Map(),
      loading: false,
      error: null,
      lastUpdated: null,
      get: () => null,
      refresh: () => {},
    };
  }
  return v;
}
