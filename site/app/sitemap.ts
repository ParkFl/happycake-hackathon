import type { MetadataRoute } from "next";
import { listCatalog } from "@/lib/mcp";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://happycake.us";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,        lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${SITE}/catalog`, lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${SITE}/policies`,lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/about`,   lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/c/mothers-day-honey`,    lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/c/office-friday`,        lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/c/weekend-pistachio`,    lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/c/valentines-honey`,     lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/c/nauryz-honey`,         lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/c/eid-honey`,            lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/c/fathers-day-honey`,    lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/c/thanksgiving-office`,  lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/c/christmas-honey`,      lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/c/back-to-school-office`,lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];
  let products: MetadataRoute.Sitemap = [];
  try {
    const cat = await listCatalog();
    products = cat.map((it) => ({
      url: `${SITE}/product/${it.kitchenProductId}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    }));
  } catch {
    products = [];
  }
  return [...fixed, ...products];
}
