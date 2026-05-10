import Link from "next/link";
import { LOGO } from "@/lib/assets";
import MobileNav from "./MobileNav";
import CartIcon from "./CartIcon";

export default function BrandHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-happy-blue-900/10 bg-cream-50/95 backdrop-blur supports-[backdrop-filter]:bg-cream-50/80">
      <div className="mx-auto flex max-w-page items-center justify-between gap-3 px-4 py-2">
        <Link
          href="/"
          className="inline-flex items-center gap-3 min-h-[44px] py-2 no-underline"
          aria-label="HappyCake home"
        >
          <img src={LOGO.size256} alt="" width={36} height={36} className="h-9 w-9" />
          <span className="font-display text-2xl text-happy-blue-900">HappyCake</span>
        </Link>

        {/* Desktop / tablet inline nav */}
        <nav aria-label="Primary" className="hidden sm:flex items-center gap-1 text-base">
          <Link href="/catalog" className="inline-flex items-center min-h-[44px] px-3 no-underline text-happy-blue-700 hover:text-happy-blue-900">
            Catalog
          </Link>
          <Link href="/policies" className="inline-flex items-center min-h-[44px] px-3 no-underline text-happy-blue-700 hover:text-happy-blue-900">
            Policies
          </Link>
          <Link href="/about" className="inline-flex items-center min-h-[44px] px-3 no-underline text-happy-blue-700 hover:text-happy-blue-900">
            About
          </Link>
          <CartIcon />
        </nav>

        {/* Mobile: cart + hamburger */}
        <div className="flex items-center sm:hidden">
          <CartIcon />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
