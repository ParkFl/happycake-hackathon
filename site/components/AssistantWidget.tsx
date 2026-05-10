"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@/lib/chat";
import { useCart } from "@/lib/cart";

const REAL_PHONE_DISPLAY = "(281) 979-8320";

/**
 * Floating chat widget. Reads/writes shared state via ChatProvider so the
 * conversation persists across page navigation. Send-while-thinking is
 * supported via the queue inside the provider.
 *
 * "Hand off to team" button sends a one-shot escalation message that the
 * /sales agent recognises and the wrapper forwards to Telegram so a person
 * takes over the chat.
 */
export default function AssistantWidget() {
  const { messages, send, pending, hydrated, isOpenRequested, pendingPrefill, consumeOpenRequest, liveOwner, handoffPending, sessionRef } = useChat();
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Honor open requests from elsewhere (e.g. NeedMoreModal).
  useEffect(() => {
    if (!isOpenRequested) return;
    setOpen(true);
    if (pendingPrefill) setInput(pendingPrefill);
    consumeOpenRequest();
  }, [isOpenRequested, pendingPrefill, consumeOpenRequest]);

  useEffect(() => {
    if (open) {
      panelRef.current
        ?.querySelector<HTMLInputElement>("input[name='msg']")
        ?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending, open]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    send(text);
    setInput("");
  }

  function handoffToTeam() {
    // Marker message the /sales agent recognises and the wrapper escalates to Telegram.
    send("Hand off to team — please connect me with a real person.");
  }

  const showUnreadBadge = hydrated && !open && messages.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={open ? "Close chat" : "Talk to us"}
        className="fixed bottom-4 right-4 z-40 inline-flex h-14 min-w-[3.5rem] items-center justify-center gap-2 rounded-full bg-happy-blue-700 px-5 font-medium text-cream-50 shadow-lg shadow-happy-blue-900/30 transition-colors hover:bg-happy-blue-900 active:bg-happy-blue-900"
      >
        {open ? "Close" : "Talk to us"}
        {showUnreadBadge && (
          <span aria-hidden className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-cream-50 px-1.5 text-xs font-bold text-happy-blue-900">
            {messages.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-happy-blue-900/40 sm:hidden"
          />
          <div
            ref={panelRef}
            id="assistant-panel"
            role="dialog"
            aria-modal="true"
            aria-label="HappyCake assistant"
            className="
              fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[60vh] max-w-page flex-col
              border-2 border-happy-blue-700/30 bg-cream-50 shadow-2xl shadow-happy-blue-900/30
              sm:bottom-20 sm:right-4 sm:left-auto sm:h-[70vh] sm:w-[380px] sm:rounded-md
            "
          >
            <header className={`flex items-center justify-between rounded-t-md px-4 py-3 text-cream-50 ${liveOwner ? "bg-accent-coral" : handoffPending ? "bg-happy-blue-900" : "bg-happy-blue-700"}`}>
              <div>
                <strong className="font-display text-lg leading-none">
                  {liveOwner
                    ? "👤 You're chatting with the team"
                    : handoffPending
                    ? "🛎 Team notified"
                    : "HappyCake assistant"}
                </strong>
                <p className="m-0 text-xs text-cream-50/80">
                  {liveOwner
                    ? "A team member jumped in — replies are from a person."
                    : handoffPending
                    ? "Waiting for the team to jump in here…"
                    : "Live chat · Sugar Land kitchen"}
                  {cart.count > 0 && <> · cart: {cart.count} item{cart.count === 1 ? "" : "s"}</>}
                  {sessionRef && <> · #{sessionRef}</>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-cream-50 hover:bg-happy-blue-900"
              >
                ×
              </button>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto bg-cream-50 p-3">
              {messages.length === 0 && (
                <p className="m-0 text-sm text-text-primary/70">
                  Ask about a cake, an order, allergens, or anything our team would answer at the counter.
                </p>
              )}
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {messages.map((m, i) => (
                  <li key={i} className={m.role === "customer" ? "self-end" : "self-start"}>
                    {m.role === "agent" && m.fromTeam && (
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-accent-coral">
                        👤 Team
                      </span>
                    )}
                    <span
                      className={`inline-block max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
                        m.role === "customer"
                          ? "bg-happy-blue-700 text-cream-50"
                          : m.fromTeam
                          ? "bg-accent-coral/10 text-text-primary border border-accent-coral/40"
                          : "bg-cream-100 text-text-primary border border-happy-blue-900/10"
                      }`}
                    >
                      {m.text}
                    </span>
                  </li>
                ))}
                {pending && <li className="self-start text-sm text-text-primary/60">typing…</li>}
                {liveOwner && !pending && (
                  <li className="self-start text-xs text-accent-coral italic">
                    The team is in the chat — replies may take a moment.
                  </li>
                )}
              </ul>
            </div>

            {/* Handoff strip — gives a one-tap path to a person if the bot isn't enough. */}
            <div className="flex flex-wrap items-center gap-2 border-t border-happy-blue-900/15 bg-cream-100 px-3 py-2 text-xs">
              <span className="text-text-primary/70">Need a person?</span>
              <button
                type="button"
                onClick={handoffToTeam}
                className="rounded border border-happy-blue-700/50 bg-cream-50 px-2 py-1 font-medium text-happy-blue-700 hover:bg-happy-blue-200/40"
              >
                Hand off to team
              </button>
              <a
                href={`https://wa.me/12819798320?text=${encodeURIComponent("Hi HappyCake — I'm on the website, can someone help me?")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-happy-blue-700/50 bg-cream-50 px-2 py-1 font-medium text-happy-blue-700 hover:bg-happy-blue-200/40 no-underline"
              >
                WhatsApp {REAL_PHONE_DISPLAY}
              </a>
            </div>

            <form
              onSubmit={onSubmit}
              className="flex items-center gap-2 border-t border-happy-blue-900/15 bg-cream-50 p-3"
            >
              <label htmlFor="assistant-msg" className="sr-only">Your message</label>
              <input
                id="assistant-msg"
                name="msg"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={pending ? "Type — your message will queue…" : "Type a message…"}
                autoComplete="off"
                className="flex-1 rounded-md border border-happy-blue-500 bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-primary/40 focus:border-happy-blue-700 focus:outline-none focus:ring-2 focus:ring-happy-blue-500/20"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="btn-primary text-sm disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
