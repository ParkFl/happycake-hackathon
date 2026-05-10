"use client";
import { useState } from "react";

export default function LeadCaptureModal() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-30 hidden h-12 items-center gap-2 rounded-full border border-happy-blue-700/30 bg-cream-50 px-4 text-happy-blue-900 hover:bg-cream-100 sm:inline-flex"
      >
        Need help?
      </button>
    );
  }

  return (
    <div role="dialog" aria-label="How can we help?" className="fixed inset-0 z-50 flex items-end justify-center bg-happy-blue-900/30 sm:items-center">
      <div className="w-full max-w-md rounded-t-md bg-cream-50 p-4 sm:rounded-md">
        <header className="mb-3 flex items-center justify-between">
          <strong className="font-display text-xl text-happy-blue-900">What do you need?</strong>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-happy-blue-700">×</button>
        </header>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <li>
            <button
              type="button"
              onClick={() => { setOpen(false); document.querySelector<HTMLButtonElement>('[aria-controls="assistant-panel"]')?.click(); }}
              className="w-full rounded-md border border-happy-blue-700/30 bg-cream-100 px-4 py-3 text-left hover:border-happy-blue-700"
            >
              <strong>Help choosing</strong>
              <span className="block text-sm text-text-primary/70">Open the on-site assistant.</span>
            </button>
          </li>
          <li>
            <a
              href={`https://wa.me/12815550100?text=${encodeURIComponent("Hi HappyCake — quick question from the website.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-md border border-happy-blue-700/30 bg-cream-100 px-4 py-3 no-underline hover:border-happy-blue-700"
            >
              <strong className="text-text-primary">Quick question (WhatsApp)</strong>
              <span className="block text-sm text-text-primary/70">Talk directly to the bakery.</span>
            </a>
          </li>
          <li>
            <a href="/catalog" className="block rounded-md border border-happy-blue-700/30 bg-cream-100 px-4 py-3 no-underline hover:border-happy-blue-700">
              <strong className="text-text-primary">Place an order</strong>
              <span className="block text-sm text-text-primary/70">Browse the catalog and pick up.</span>
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
