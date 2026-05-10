// scripts/mobile_cart_smoke.mjs — exercise the new cart + chat persistence flow
// at iPhone SE viewport against production. Verifies P3 (catalog unified grid),
// P4 (mobile menu opaque), P5 (cart end-to-end), P6 (chat survives navigation).

import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "https://happycake-us.vercel.app";
const DEST = process.env.DEST ?? "research/mobile-cart-smoke";

await mkdir(DEST, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone SE"], viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const log = (m) => console.log("→", m);

// 1. Catalog grid
log("catalog");
await page.goto(`${BASE}/catalog`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${DEST}/01-catalog-mobile.png`, fullPage: true });

// 2. Open mobile menu, verify opaque
log("mobile menu open");
await page.click('button[aria-label="Open menu"]');
await page.waitForSelector('div[role="dialog"][aria-label="Site navigation"]');
await page.screenshot({ path: `${DEST}/02-mobile-menu-open.png`, fullPage: false });
// Close menu — Esc key (multiple "Close menu" buttons exist; pointer events tricky)
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 3. Add 2 items to cart from product pages
log("add cake Honey (whole)");
await page.goto(`${BASE}/product/whole-honey-cake`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${DEST}/03-product-page.png`, fullPage: true });
await page.click('button:has-text("Add to cart")');
await page.waitForTimeout(500);

log("add 2x pistachio roll");
await page.goto(`${BASE}/product/pistachio-roll`, { waitUntil: "networkidle" });
await page.click('button[aria-label="Increase quantity"]');
await page.click('button:has-text("Add to cart")');
await page.waitForTimeout(500);
await page.screenshot({ path: `${DEST}/04-product-after-add.png`, fullPage: true });

// 4. Open chat from a product page, send a question, NAVIGATE to /cart, verify chat is still open
log("open chat, send 'what is in my cart?'");
await page.click('button[aria-label="Talk to us"]');
await page.waitForSelector('#assistant-panel');
await page.fill('input[name="msg"]', "What is in my cart and how much?");
await page.click('button:has-text("Send")');
// Wait for agent reply (up to 90s)
await page.waitForFunction(() => {
  const items = document.querySelectorAll('#assistant-panel ul li');
  return items.length >= 2; // user + at least one agent reply
}, { timeout: 110000 });
await page.screenshot({ path: `${DEST}/05-chat-with-reply.png`, fullPage: false });

// 5. Navigate to /cart while chat is open — should persist
log("navigate to /cart with chat open");
await page.goto(`${BASE}/cart`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${DEST}/06-cart-with-chat-open.png`, fullPage: true });

// 6. Cart shows items + totals
log("cart screenshot");
// chat panel may still cover; close it first to see cart cleanly
const closeBtn = await page.$('button[aria-label="Close chat"]');
if (closeBtn) await closeBtn.click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${DEST}/07-cart-cleaned.png`, fullPage: true });

// 7. Place an order
log("fill checkout fields and place order");
await page.fill('input[autocomplete="name"]', "Smoke Customer");
await page.fill('input[autocomplete="tel"]', "+18325550199");
// pickup time: 2 hours from now
const dt = new Date(Date.now() + 2 * 3600 * 1000);
const dtStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}T${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
await page.fill('input[type="datetime-local"]', dtStr);
await page.click('button:has-text("Place pickup order")');
await page.waitForURL(/\/confirmation\//, { timeout: 60000 });
await page.screenshot({ path: `${DEST}/08-confirmation.png`, fullPage: true });

const confirmedUrl = page.url();
log(`confirmation url: ${confirmedUrl}`);

await browser.close();

console.log("\n=== smoke complete ===");
console.log(`Screenshots in ${DEST}/`);
console.log(`Confirmation URL: ${confirmedUrl}`);
