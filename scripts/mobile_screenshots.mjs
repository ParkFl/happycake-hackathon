// scripts/mobile_screenshots.mjs — Playwright screenshot tour at iPhone SE (375x667)
// Usage: BASE=https://happycake-us.vercel.app DEST=research/mobile-issues-before node scripts/mobile_screenshots.mjs

import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "https://happycake-us.vercel.app";
const DEST = process.env.DEST ?? "research/mobile-issues-before";

const ROUTES = [
  ["home", "/"],
  ["catalog", "/catalog"],
  ["product-honey-whole", "/product/whole-honey-cake"],
  ["product-honey-slice", "/product/honey-cake-slice"],
  ["product-pistachio", "/product/pistachio-roll"],
  ["product-custom", "/product/custom-birthday-cake"],
  ["product-office", "/product/office-dessert-box"],
  ["order-honey-whole", "/order/whole-honey-cake"],
  ["order-office", "/order/office-dessert-box"],
  ["campaign-mothers-day", "/c/mothers-day-honey"],
  ["policies", "/policies"],
  ["about", "/about"],
];

await mkdir(DEST, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices["iPhone SE"],
  // iPhone SE = 375x667. Force exact viewport for deterministic shots.
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 2,
});
const issues = [];

for (const [name, path] of ROUTES) {
  const page = await ctx.newPage();
  const url = BASE + path;
  console.log(`→ ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: `${DEST}/${name}.png`, fullPage: true });

    // Diagnostic checks
    const hScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    if (hScroll) issues.push(`${path}: HORIZONTAL SCROLL`);

    // Inspect tap targets (anchors + buttons): collect any with bounding rect < 44px tall
    const tooSmall = await page.evaluate(() => {
      const found = [];
      const elems = document.querySelectorAll("a[href], button");
      for (const el of elems) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.height < 44) {
          const txt = (el.textContent ?? "").trim().slice(0, 30);
          found.push(`${el.tagName.toLowerCase()} h=${Math.round(r.height)}px "${txt}"`);
        }
      }
      return found;
    });
    if (tooSmall.length) issues.push(`${path}: TAP TARGETS <44px → ${tooSmall.join(" | ")}`);

    // Body font-size check
    const bodyFs = await page.evaluate(
      () => parseFloat(getComputedStyle(document.body).fontSize)
    );
    if (bodyFs < 14) issues.push(`${path}: body font-size ${bodyFs}px < 14`);

  } catch (e) {
    issues.push(`${path}: ERROR ${e.message}`);
  }
  await page.close();
}
await browser.close();

console.log("\n=== ISSUES FOUND ===");
if (issues.length === 0) console.log("(none)");
else issues.forEach((i) => console.log(" - " + i));
console.log(`\n=== Screenshots in ${DEST}/ ===`);
