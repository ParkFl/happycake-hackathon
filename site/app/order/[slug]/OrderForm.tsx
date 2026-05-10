"use client";

import { useState } from "react";

type Flow = "birthday" | "office" | "gift" | "custom";

type Props = {
  slug: string;
  variationId: string;
  productName: string;
  priceCents: number;
  category: string;
  initialFlow: Flow;
};

type SubmitResult =
  | { ok: true; orderId: string; readyAt?: string; status: string; message?: string }
  | { ok: false; error: string };

export default function OrderForm(props: Props) {
  const [flow, setFlow] = useState<Flow>(props.initialFlow);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  // shared
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupAt, setPickupAt] = useState("");
  const [quantity, setQuantity] = useState(1);

  // birthday/custom
  const [messageOnTop, setMessageOnTop] = useState("");

  // office
  const [headcount, setHeadcount] = useState(12);
  const [deliveryMode, setDeliveryMode] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [billing, setBilling] = useState<"card" | "invoice">("card");

  // gift
  const [isGift, setIsGift] = useState(props.initialFlow === "gift");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [giftNote, setGiftNote] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    const payload = {
      flow,
      slug: props.slug,
      variationId: props.variationId,
      quantity: Number(quantity) || 1,
      pickupAt,
      customer: { name, phone },
      messageOnTop: flow === "birthday" || flow === "custom" ? messageOnTop : undefined,
      office: flow === "office" ? { headcount, deliveryMode, deliveryAddress, billing } : undefined,
      gift: isGift ? { recipientName, recipientAddress, giftNote, hidePrice: true } : undefined,
    };
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: data?.error ?? `HTTP ${res.status}` });
      } else {
        setResult({
          ok: true,
          orderId: data.orderId ?? "(pending owner approval)",
          readyAt: data.readyAt,
          status: data.status ?? "submitted",
          message: data.message,
        });
      }
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="surface p-6">
        <h2 className="mb-2">Got it.</h2>
        <p className="mb-3 text-text-primary/80">
          {result.message ?? `Order ${result.orderId} is ${result.status}.`}
        </p>
        {result.readyAt && (
          <p className="mb-3 text-sm">Ready at <strong>{new Date(result.readyAt).toLocaleString()}</strong>.</p>
        )}
        <p className="mb-3 text-sm text-text-primary/70">
          We&rsquo;ll confirm by phone or WhatsApp. Reference your order id when you arrive: <code>{result.orderId}</code>
        </p>
        <a href="/" className="btn-secondary">Back to home</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface space-y-5 p-6">
      {/* Flow selector */}
      <fieldset>
        <legend className="mb-2 font-medium">Order type</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {(["birthday", "office", "gift", "custom"] as Flow[]).map((f) => {
            // Hide custom toggle if not catalog-custom (custom flow only relevant for custom-birthday-cake)
            const disabled =
              (f === "custom" && props.category !== "custom") ||
              (f === "office" && props.category !== "catering" && props.category !== "whole-cakes");
            return (
              <label
                key={f}
                className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${
                  flow === f
                    ? "border-happy-blue-700 bg-happy-blue-700 text-cream-50"
                    : "border-happy-blue-700/30 bg-cream-50 text-happy-blue-900"
                } ${disabled ? "opacity-40" : ""}`}
              >
                <input
                  type="radio"
                  name="flow"
                  value={f}
                  checked={flow === f}
                  disabled={disabled}
                  onChange={() => setFlow(f)}
                  className="sr-only"
                />
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </label>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-text-primary/60">
          {flow === "birthday" && 'Default. Pickup, optional message on top for celebrations.'}
          {flow === "office" && "Headcount, delivery or pickup, billing preference. Larger orders may need owner confirmation."}
          {flow === "gift" && "Recipient details replace billing-customer fields. Price is hidden in the box."}
          {flow === "custom" && "Custom design + team approval. Submitted to the queue, confirmed within the hour."}
        </p>
      </fieldset>

      {/* Shared customer fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Your name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Phone (WhatsApp)</span>
          <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+1 832 …" className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Pickup or delivery date/time</span>
          <input required type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Quantity</span>
          <input type="number" min={1} max={20} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2" />
        </label>
      </div>

      {/* Birthday-specific */}
      {(flow === "birthday" || flow === "custom") && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Message on top {flow === "custom" && "(required for custom)"}
          </span>
          <input
            value={messageOnTop}
            onChange={(e) => setMessageOnTop(e.target.value)}
            maxLength={60}
            placeholder='e.g. "Happy 60th, Mom"'
            required={flow === "custom"}
            className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-text-primary/60">Up to 60 characters. Plain text.</span>
        </label>
      )}

      {/* Office-specific */}
      {flow === "office" && (
        <fieldset className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Headcount</span>
              <input type="number" min={1} max={500} value={headcount} onChange={(e) => setHeadcount(Number(e.target.value))} className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2" />
            </label>
            <div>
              <span className="mb-1 block text-sm font-medium">Delivery mode</span>
              <div className="flex gap-3">
                <label><input type="radio" name="dm" value="pickup" checked={deliveryMode === "pickup"} onChange={() => setDeliveryMode("pickup")} /> Pickup</label>
                <label><input type="radio" name="dm" value="delivery" checked={deliveryMode === "delivery"} onChange={() => setDeliveryMode("delivery")} /> Delivery</label>
              </div>
            </div>
          </div>
          {deliveryMode === "delivery" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Delivery address</span>
              <input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Street, suite, ZIP" required className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2" />
            </label>
          )}
          <div>
            <span className="mb-1 block text-sm font-medium">Billing</span>
            <div className="flex gap-3">
              <label><input type="radio" name="bill" value="card" checked={billing === "card"} onChange={() => setBilling("card")} /> Pay at pickup (card)</label>
              <label><input type="radio" name="bill" value="invoice" checked={billing === "invoice"} onChange={() => setBilling("invoice")} /> Net-30 invoice</label>
            </div>
          </div>
        </fieldset>
      )}

      {/* Gift toggle (available on any flow except custom-only) */}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} />
        <span className="text-sm">Send as a gift (we&rsquo;ll hide the price in the box)</span>
      </label>

      {isGift && (
        <fieldset className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Recipient name</span>
              <input required value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Recipient address (or phone)</span>
              <input required value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Gift note (printed)</span>
            <input value={giftNote} onChange={(e) => setGiftNote(e.target.value)} maxLength={120} className="w-full rounded-md border border-happy-blue-900/20 bg-cream-50 px-3 py-2" />
          </label>
        </fieldset>
      )}

      {/* Submit */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <p className="text-sm text-text-primary/70">
          {flow === "custom" && "On submit, this goes to the team for OK. We'll confirm within the hour."}
          {flow !== "custom" && (
            <>Total: <strong>{`$${((props.priceCents * quantity) / 100).toFixed(2)}`}</strong></>
          )}
        </p>
        <button type="submit" className="btn-primary disabled:opacity-50" disabled={submitting}>
          {submitting ? "Submitting…" : flow === "custom" ? "Submit for approval" : "Place pickup order"}
        </button>
      </div>

      {result && !result.ok && (
        <p role="alert" className="rounded-md border border-accent-coral/40 bg-accent-coral/10 px-3 py-2 text-sm text-accent-coral">
          {result.error}
        </p>
      )}
    </form>
  );
}
