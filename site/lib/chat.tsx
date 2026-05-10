"use client";

/**
 * site/lib/chat.tsx — site chat context.
 *
 * Why a context (not local state in the widget):
 *   - Survives page navigation (App Router keeps the layout mounted; we mount
 *     the widget at layout level, not per page).
 *   - Lets pages READ the in-flight state if they want a "chat is busy" pill.
 *   - Persists transcript to sessionStorage so reload mid-conversation works.
 *
 * Concurrency model: a serial queue. The user can keep typing and pressing Send
 * even while the previous turn is in flight; messages enter the transcript
 * immediately and a worker effect drains the queue one turn at a time. This
 * avoids out-of-order responses without freezing the input.
 *
 * The cart from `useCart()` is read at send-time and shoved into the envelope's
 * page_context.cart so the /sales agent can answer "what's in my cart?".
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
import { useCart, type CartItem } from "./cart";

export type ChatMsg = {
  role: "customer" | "agent";
  text: string;
  ts: number;
  // When set, the message came from a real human on the team (not the bot).
  // Used by the widget to render a "Team" badge instead of "Assistant".
  fromTeam?: boolean;
};

type ChatCtx = {
  messages: ChatMsg[];
  pending: boolean;       // a turn is in-flight or queued
  send: (text: string) => void;
  clear: () => void;
  hydrated: boolean;
  // External-trigger surface — used by other components (e.g. NeedMoreModal)
  // to pop the chat open with a pre-filled message.
  isOpenRequested: boolean;
  pendingPrefill: string | null;
  requestOpen: (prefill?: string) => void;
  consumeOpenRequest: () => void;
  // True while a real teammate is handling the chat instead of the bot.
  liveOwner: boolean;
  // True after the agent has flagged this session for owner handoff
  // (handoff_acknowledged on the /api/chat response). Used to show a
  // "team notified — waiting" indicator and to switch polling to fast cadence.
  handoffPending: boolean;
  // Last 6 chars of the session id — surfaced in the chat header so the owner
  // can sanity-check that the Telegram thread_key matches the customer tab.
  sessionRef: string;
};

const Ctx = createContext<ChatCtx | null>(null);
const STORAGE_KEY = "hc-chat-v1";
const SESSION_KEY = "hc-chat-session-v1";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      // crypto.randomUUID is widely available; fall back to a hand-rolled id
      // for the few user agents (older iOS Safari etc) that lack it.
      id = (window.crypto && typeof window.crypto.randomUUID === "function")
        ? window.crypto.randomUUID()
        : "s-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "s-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

const FALLBACK_REPLY =
  "We're briefly offline on the chat. Reach the shop at (281) 979-8320, or DM @happycake.us on Instagram, and we'll get right back to you. — the HappyCake team";

function snapshotCartForEnvelope(items: CartItem[]) {
  return items.map((i) => ({
    slug: i.slug,
    name: i.name,
    quantity: i.quantity,
    price_usd: Number((i.priceCents / 100).toFixed(2)),
    line_total_usd: Number(((i.priceCents * i.quantity) / 100).toFixed(2)),
  }));
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isOpenRequested, setIsOpenRequested] = useState(false);
  const [pendingPrefill, setPendingPrefill] = useState<string | null>(null);
  const [liveOwner, setLiveOwner] = useState(false);
  const [handoffPending, setHandoffPending] = useState(false);
  const messagesRef = useRef<ChatMsg[]>([]);
  const sessionIdRef = useRef<string>("");
  const cart = useCart();

  if (!sessionIdRef.current) sessionIdRef.current = getOrCreateSessionId();
  const sessionRef = sessionIdRef.current.slice(-6).toUpperCase();

  // Hydrate from sessionStorage
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
          messagesRef.current = parsed;
        }
      }
    } catch {
      /* corrupt storage */
    }
    setHydrated(true);
  }, []);

  // Persist
  useEffect(() => {
    if (!hydrated) return;
    messagesRef.current = messages;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      /* quota */
    }
  }, [messages, hydrated]);

  // Queue worker — pulls one queued text at a time and runs it through /api/chat.
  useEffect(() => {
    if (busy || queue.length === 0) return;
    const text = queue[0];
    setQueue((q) => q.slice(1));
    setBusy(true);

    (async () => {
      try {
        // Transcript = everything before this customer message went in.
        // We snapshot from the ref so concurrent enqueues don't race.
        const transcript = messagesRef.current
          .slice(0, -1) // exclude the latest customer msg (it's the latest_message)
          .map(({ role, text }) => ({ role, text }));

        const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "site_chat",
            session_id: sessionIdRef.current,
            page_context: {
              pathname,
              cart: snapshotCartForEnvelope(cart.items),
              cart_total_usd: Number((cart.total / 100).toFixed(2)),
              cart_item_count: cart.count,
            },
            transcript,
            latest_message: text,
          }),
        });
        const data = await res.json().catch(() => ({}));
        // Server tells us the thread is in live-owner mode → don't append a bot
        // reply; the polling effect below will pull the human's reply instead.
        const isLive = Boolean(data?.live);
        setLiveOwner(isLive);
        // Once the agent has flagged the session for handoff (or it's already
        // live), we keep polling fast — the team-member's first reply could land
        // on the very next tick.
        if (data?.handoff_acknowledged || isLive) setHandoffPending(true);
        if (!isLive) {
          const reply = (typeof data.reply_text === "string" && data.reply_text.trim())
            ? data.reply_text
            : FALLBACK_REPLY;
          setMessages((m) => [...m, { role: "agent", text: reply, ts: Date.now() }]);
        }
      } catch {
        setMessages((m) => [...m, { role: "agent", text: FALLBACK_REPLY, ts: Date.now() }]);
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, queue, cart.items, cart.total, cart.count]);

  // Poll for live owner replies. Active whenever liveOwner is true OR the
  // last reply was a handoff (server has not yet flipped to live, but a human
  // is about to). 4-second cadence keeps owner-typed replies feeling
  // responsive without hammering the tunnel.
  useEffect(() => {
    if (!hydrated) return;
    const sid = sessionIdRef.current;
    if (!sid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/chat/poll?session_id=${encodeURIComponent(sid)}`);
        if (!r.ok) return;
        const data = await r.json().catch(() => null);
        if (!data || cancelled) return;
        const incoming = Array.isArray(data.messages) ? data.messages : [];
        if (incoming.length > 0) {
          setMessages((m) => [
            ...m,
            ...incoming.map((it: { text: string; ts?: string; from_role?: string }) => ({
              role: "agent" as const,
              text: it.text,
              ts: it.ts ? Date.parse(it.ts) || Date.now() : Date.now(),
              fromTeam: it.from_role === "owner",
            })),
          ]);
        }
        if (typeof data.live === "boolean") setLiveOwner(data.live);
      } catch {
        /* network blip — try again next tick */
      }
    };
    // First tick eagerly, then on interval. We poll fast (4s) whenever a
    // handoff is in flight OR a teammate is already live — those are the
    // moments where customer waiting matters most. Otherwise 12s is fine
    // (catches the case where the owner takes over an idle thread).
    tick();
    const interval = (liveOwner || handoffPending) ? 4000 : 12000;
    const id = window.setInterval(tick, interval);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [hydrated, liveOwner, handoffPending]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { role: "customer", text: trimmed, ts: Date.now() }]);
    setQueue((q) => [...q, trimmed]);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setQueue([]);
  }, []);

  const requestOpen = useCallback((prefill?: string) => {
    setIsOpenRequested(true);
    setPendingPrefill(prefill ?? null);
  }, []);

  const consumeOpenRequest = useCallback(() => {
    setIsOpenRequested(false);
    setPendingPrefill(null);
  }, []);

  const value = useMemo<ChatCtx>(
    () => ({
      messages,
      pending: busy || queue.length > 0,
      send,
      clear,
      hydrated,
      isOpenRequested,
      pendingPrefill,
      requestOpen,
      consumeOpenRequest,
      liveOwner,
      handoffPending,
      sessionRef,
    }),
    [messages, busy, queue.length, send, clear, hydrated, isOpenRequested, pendingPrefill, requestOpen, consumeOpenRequest, liveOwner, handoffPending, sessionRef]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat(): ChatCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChat must be used inside <ChatProvider>");
  return v;
}
