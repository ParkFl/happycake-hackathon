/**
 * site/lib/assets.ts — approved HappyCake CDN asset paths.
 *
 * Organizers host all 22 optimized images + 3 logo sizes at a public CDN.
 * Use these paths directly — DO NOT re-host or use raw originals.
 * The metadata.json at the URL below is the source of truth for the full list.
 *
 * Public base: https://www.steppebusinessclub.com/hackathon-assets/happy-cake/
 * Metadata:    https://www.steppebusinessclub.com/hackathon-assets/happy-cake/metadata.json
 * Brandbook:   https://www.steppebusinessclub.com/hackathon-assets/HCU_BRANDBOOK.md
 */

export const ASSET_BASE = "https://www.steppebusinessclub.com/hackathon-assets/happy-cake";

export const LOGO = {
  size1024: `${ASSET_BASE}/logo/happy-cake-logo-1024.png`,
  size512: `${ASSET_BASE}/logo/happy-cake-logo-512.png`,
  size256: `${ASSET_BASE}/logo/happy-cake-logo-256.png`,
} as const;

/** 4 hero images (1600×1000), suitable for landing pages and feature sections. */
export const HERO_IMAGES = [
  `${ASSET_BASE}/hero/happy-cake-hero-01.webp`,
  `${ASSET_BASE}/hero/happy-cake-hero-02.webp`,
  `${ASSET_BASE}/hero/happy-cake-hero-03.webp`,
  `${ASSET_BASE}/hero/happy-cake-hero-04.webp`,
] as const;

/** 10 product images (1200×1200), suitable for product cards and detail pages. */
export const PRODUCT_IMAGES = [
  `${ASSET_BASE}/products/happy-cake-product-01.webp`,
  `${ASSET_BASE}/products/happy-cake-product-02.webp`,
  `${ASSET_BASE}/products/happy-cake-product-03.webp`,
  `${ASSET_BASE}/products/happy-cake-product-04.webp`,
  `${ASSET_BASE}/products/happy-cake-product-05.webp`,
  `${ASSET_BASE}/products/happy-cake-product-06.webp`,
  `${ASSET_BASE}/products/happy-cake-product-07.webp`,
  `${ASSET_BASE}/products/happy-cake-product-08.webp`,
  `${ASSET_BASE}/products/happy-cake-product-09.webp`,
  `${ASSET_BASE}/products/happy-cake-product-10.webp`,
] as const;

/** 8 social crops (1080×1080), for Instagram and campaign creatives. */
export const SOCIAL_IMAGES = [
  `${ASSET_BASE}/social/happy-cake-social-01.webp`,
  `${ASSET_BASE}/social/happy-cake-social-02.webp`,
  `${ASSET_BASE}/social/happy-cake-social-03.webp`,
  `${ASSET_BASE}/social/happy-cake-social-04.webp`,
  `${ASSET_BASE}/social/happy-cake-social-05.webp`,
  `${ASSET_BASE}/social/happy-cake-social-06.webp`,
  `${ASSET_BASE}/social/happy-cake-social-07.webp`,
  `${ASSET_BASE}/social/happy-cake-social-08.webp`,
] as const;

/**
 * Map kitchenProductId (catalog slug) to a representative product image.
 * Pick deterministically so each product page has a stable image across deploys.
 *
 * Note: the curated pack is photographs of cakes; mapping is by category
 * because the photos are not 1:1 to the 5 sandbox SKUs. Adjust by hand if
 * a particular photo looks better for a particular product.
 */
export const PRODUCT_IMAGE_BY_SLUG: Record<string, string> = {
  "honey-cake-slice": PRODUCT_IMAGES[0],
  "whole-honey-cake": PRODUCT_IMAGES[1],
  "pistachio-roll": PRODUCT_IMAGES[2],
  "custom-birthday-cake": PRODUCT_IMAGES[3],
  "office-dessert-box": PRODUCT_IMAGES[4],
};

/** Returns the hero image to feature on the home page (rotates by day-of-year). */
export function pickDailyHero(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return HERO_IMAGES[dayOfYear % HERO_IMAGES.length];
}

/**
 * For a given catalog slug, return the image URL.
 * Falls back to the first product image if slug isn't mapped.
 */
export function imageForSlug(slug: string): string {
  return PRODUCT_IMAGE_BY_SLUG[slug] ?? PRODUCT_IMAGES[0];
}
