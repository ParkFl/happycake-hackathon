"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@/lib/chat";

const REAL_PHONE_DISPLAY = "(281) 979-8320";
const WA_PHONE_DIGITS = "12819798320";

type Props = {
  open: boolean;
  onClose: () => void;
  productName: string;
  productSlug: string;
  requestedQty: number;
};

/**
 * "Need more?" modal — pops when the customer tries to add more of an item
 * than today's kitchen actually has. Three paths to keep the conversation
 * alive, none of which silently fail:
 *
 *   1. Ask the chat        → opens the on-site assistant with a pre-filled question
 *   2. Send a contact form → POSTs to /api/contact → owner Telegram alert
 *   3. WhatsApp link        → wa.me deep link with a prefilled message
 *
 * The form path is the highest-conversion option because it captures the
 * customer's contact details whether or not they engage further.
 */
export default function NeedMoreModal({ open, onClose, productName, productSlug, requestedQty }: Props) {
  const { requestOpen: openChat } = useChat();
  const [view, setView] = useState<"choose" | "form">("choose");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setView("choose");
    setSubmitted(false);
    setError(null);
    closeBtnRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleAskChat() {
    openChat(
      `I'd like to order ${requestedQty}× ${productName} but the cart is limited. Can the team confirm what's possible for today or tomorrow?`,
    );
    onClose();
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "bulk_request",
          customer: { name, phone },
          item: { slug: productSlug, name: productName, requested_qty: requestedQty },
          message: note || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setSubmitted(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Need more than what's in stock?"
      className="fixed inset-0 z-50 flex items-end justify-center bg-happy-blue-900/50 p-3 sm:items-center"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        tabIndex={-1}
      />
      <div className="relative w-full max-w-lg rounded-md border border-happy-blue-700/30 bg-cream-50 shadow-2xl"
           style={{ backgroundColor: "rgb(251, 246, 232)" }}>
        <header className="flex items-start justify-between rounded-t-md bg-happy-blue-700 px-4 py-3 text-cream-50">
          <div>
            <strong className="font-display text-lg leading-none">Want more than what's ready?</strong>
            <p className="m-0 mt-1 text-xs text-cream-50/80">
              Today's batch of {productName} is limited. We can almost always work something out for tomorrow or a bigger order — pick how you want to talk it through.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-cream-50 hover:bg-happy-blue-900"
          >
            ×
          </button>
        </header>

        {submitted ? (
          <div className="p-5">
            <p className="m-0 text-text-primary">
              ✓ Got it — the team will reach out within the hour at the number you gave us.
              In the meantime, feel free to keep browsing.
            </p>
            <button type="button" onClick={onClose} className="btn-primary mt-4">Close</button>
          </div>
        ) : view === "choose" ? (
          <div className="space-y-3 p-5">
            <button
              type="button"
              onClick={handleAskChat}
              className="w-full rounded-md border border-happy-blue-700/30 bg-cream-100 px-4 py-3 text-left no-underline hover:border-happy-blue-700"
            >
              <strong className="text-text-primary">💬 Ask the chat</strong>
              <span className="block text-sm text-text-primary/70">
                Talk to the on-site assistant — answers in seconds, knows the kitchen.
              </span>
            </button>

            <button
              type="button"
              onClick={() => setView("form")}
              className="w-full rounded-md border border-happy-blue-700/30 bg-cream-100 px-4 py-3 text-left no-underline hover:border-happy-blue-700"
            >
              <strong className="text-text-primary">📝 Send your number to the team</strong>
              <span className="block text-sm text-text-primary/70">
                We'll call you back within the hour to confirm timing for a larger order.
              </span>
            </button>

            <a
              href={`https://wa.me/${WA_PHONE_DIGITS}?text=${encodeURIComponent(
                `Hi HappyCake — I'd like to order ${requestedQty}× ${productName}. The cart is limited; can we work something out for today or tomorrow?`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md border border-happy-blue-700/30 bg-cream-100 px-4 py-3 no-underline hover:border-happy-blue-700"
            >
              <strong className="text-text-primary">📞 Open WhatsApp</strong>
              <span className="block text-sm text-text-primary/70">
                Message us at {REAL_PHONE_DISPLAY} — we typically reply within minutes.
              </span>
            </a>
          </div>
        ) : (
          <form onSubmit={submitForm} className="space-y-4 p-5">
            <p className="m-0 text-sm text-text-primary/80">
              You're asking about <strong>{requestedQty}× {productName}</strong>.
              Leave us your number and we'll call back within the hour to confirm.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Your name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className="w-full rounded-md border border-happy-blue-900/20 bg-white px-3 py-2 text-text-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Phone (WhatsApp)</span>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="+1 832 …"
                className="w-full rounded-md border border-happy-blue-900/20 bg-white px-3 py-2 text-text-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Anything else? (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Date, occasion, message on top, dietary notes…"
                className="w-full rounded-md border border-happy-blue-900/20 bg-white px-3 py-2 text-text-primary"
              />
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => setView("choose")} className="btn-secondary">
                Back
              </button>
              <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
                {submitting ? "Sending…" : "Send to the team"}
              </button>
            </div>
            {error && (
              <p role="alert" className="rounded-md border border-accent-coral/40 bg-accent-coral/10 px-3 py-2 text-sm text-[#8E3320]">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
