import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import BrandHeader from "@/components/BrandHeader";
import BrandFooter from "@/components/BrandFooter";
import JsonLd from "@/components/JsonLd";
import AssistantWidget from "@/components/AssistantWidget";
import { CartProvider } from "@/lib/cart";
import { ChatProvider } from "@/lib/chat";
import { InventoryProvider } from "@/lib/inventory";

// Per brandbook §4.3 — Cormorant Garamond for display, Inter for body/UI.
// Loading via next/font (self-hosted; subsetting; preload) so the brand fonts
// actually render instead of falling back to Georgia/system sans.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display-loaded",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-loaded",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://happycake.us";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "HappyCake — the original taste of happiness, Sugar Land",
    template: "%s — HappyCake",
  },
  description:
    "HappyCake — hand-baked classic cakes from a small Sugar Land, TX kitchen. Whole cake \"Honey\", slices, cake \"Pistachio Roll\", custom birthday cakes, office dessert boxes. Same-day pickup for what's on the counter, 24-hour lead for full bakes.",
  openGraph: {
    type: "website",
    siteName: "HappyCake",
    title: "HappyCake — the original taste of happiness",
    description:
      "Hand-baked classic cakes from a small Sugar Land kitchen. Order pickup at happycake.us.",
    images: [
      {
        url: "https://www.steppebusinessclub.com/hackathon-assets/happy-cake/hero/happy-cake-hero-01.webp",
        width: 1600,
        height: 1000,
        alt: "Whole cake \"Honey\" with cream layers and walnuts on top",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "https://www.steppebusinessclub.com/hackathon-assets/happy-cake/logo/happy-cake-logo-256.png", sizes: "256x256", type: "image/png" },
    ],
    apple: "https://www.steppebusinessclub.com/hackathon-assets/happy-cake/logo/happy-cake-logo-256.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBF6E8",
};

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "BakeryBreadShop",
  name: "HappyCake",
  url: SITE_URL,
  image:
    "https://www.steppebusinessclub.com/hackathon-assets/happy-cake/logo/happy-cake-logo-1024.png",
  telephone: "+1-281-979-8320",
  address: {
    "@type": "PostalAddress",
    streetAddress: "350 Promenade Way, Suite 500",
    addressLocality: "Sugar Land",
    addressRegion: "TX",
    postalCode: "77478",
    addressCountry: "US",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 29.609124,
    longitude: -95.6477312,
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "11:00",
      closes: "19:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Sunday",
      opens: "12:00",
      closes: "18:00",
    },
  ],
  priceRange: "$",
  servesCuisine: ["Bakery", "Dessert"],
  sameAs: ["https://www.instagram.com/happycake.us/"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <InventoryProvider>
          <CartProvider>
            <ChatProvider>
              <BrandHeader />
              <main id="main">{children}</main>
              <BrandFooter />
              {/* One AssistantWidget for the whole app — survives navigation,
                  so the chat stays open and the transcript persists. */}
              <AssistantWidget />
            </ChatProvider>
          </CartProvider>
        </InventoryProvider>
        <JsonLd data={localBusinessJsonLd} />
      </body>
    </html>
  );
}
