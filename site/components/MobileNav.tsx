"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/catalog", label: "Catalog" },
  { href: "/cart", label: "Cart" },
  { href: "/policies", label: "Policies" },
  { href: "/about", label: "About" },
];

/**
 * Mobile-only hamburger nav. Hidden on sm:+ where the inline nav lives in BrandHeader.
 * Keyboard accessible: Tab through, Enter activates, Esc closes.
 *
 * Belt-and-suspenders on backgrounds: we set both the Tailwind class AND an inline
 * style with the RGB literal, so the menu sheet is opaque even if Tailwind's
 * <alpha-value> resolution fails for any reason.
 */
export default function MobileNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav-overlay"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-happy-blue-900 hover:bg-happy-blue-200/40 focus-visible:outline-2 focus-visible:outline-happy-blue-500 focus-visible:outline-offset-2"
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <div
          id="mobile-nav-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="fixed inset-0 z-50 isolate"
        >
          {/* Solid (not translucent) backdrop — tap to close */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-happy-blue-900/70"
            style={{ backgroundColor: "rgba(14, 42, 60, 0.7)" }}
          />
          {/* Sheet — fully opaque cream + solid border + shadow.
              Inline style guarantees opacity even if Tailwind tokens fail. */}
          <nav
            aria-label="Mobile primary"
            className="relative ml-auto flex h-full w-[88%] max-w-sm flex-col border-l-2 border-happy-blue-700 bg-cream-50 shadow-2xl"
            style={{ backgroundColor: "rgb(251, 246, 232)" }}
          >
            <div
              className="flex items-center justify-between border-b border-happy-blue-900/20 px-4 py-3"
              style={{ backgroundColor: "rgb(251, 246, 232)" }}
            >
              <span
                className="font-display text-xl"
                style={{ color: "rgb(14, 42, 60)" }}
              >HappyCake</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-happy-blue-900 hover:bg-happy-blue-200/40"
                style={{ color: "rgb(14, 42, 60)" }}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <ul
              className="m-0 flex flex-1 list-none flex-col gap-1 p-3"
              style={{ backgroundColor: "rgb(251, 246, 232)" }}
            >
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-[48px] items-center rounded-md px-4 py-3 text-lg font-medium no-underline hover:bg-happy-blue-200/40 active:bg-happy-blue-200/60"
                    style={{ color: "rgb(14, 42, 60)" }}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div
              className="border-t border-happy-blue-900/20 p-3"
              style={{ backgroundColor: "rgb(251, 246, 232)" }}
            >
              <Link
                href="/order/whole-honey-cake"
                onClick={() => setOpen(false)}
                className="btn-primary w-full"
              >
                Order pickup
              </Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
