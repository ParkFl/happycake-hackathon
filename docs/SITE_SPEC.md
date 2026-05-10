# Site spec — happycake.us

The site is the primary deliverable. This file is the build spec — pages, routes, components, brand tokens, the four customer journeys. Claude Code references this when scaffolding `site/`.

## Stack

- **Framework**: Next.js 14, App Router, TypeScript strict.
- **Hosting**: Vercel (production candidate URL `happycake.us`); for the hackathon we run locally and expose via ngrok.
- **Styling**: Tailwind CSS + a small `tokens.css` with brand variables.
- **Server-side rendering** for product/catalog/policies pages so JSON-LD ships in initial HTML.
- **No localStorage / sessionStorage** in the chat widget — all state in React.

## Brand tokens (from brandbook v1.0)

`site/styles/tokens.css`:

```css
:root {
  --happy-blue-900: #0E2A3C;   /* page chrome, dark hero, footer */
  --happy-blue-700: #1B4868;   /* logo blue, primary buttons */
  --happy-blue-500: #3B7BA8;   /* mid blue — links, accents */
  --happy-blue-200: #BFD8E8;   /* light blue — surfaces, badges */
  --cream-50:       #FBF6E8;   /* page background */
  --cream-100:      #F4ECD3;   /* card surfaces */
  --cream-200:      #E9DBB4;   /* highlight, dot patterns */
  --accent-coral:   #E08066;   /* Mother's Day / love */
  --accent-green:   #6E9D74;   /* spring / Eid / Easter */
  --text-primary:   #1A1816;
  --text-on-blue:   #FBF6E8;

  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body:    'Inter', -apple-system, system-ui, sans-serif;

  --radius-sm: 4px;
  --radius-md: 8px;

  --max-page: 1200px;
}
```

Type scale: h1 48/1.05, h2 32/1.15, h3 22/1.25, body 16/1.6, small 13/1.5.

## Routes

| Path | Purpose | Render |
|---|---|---|
| `/` | Home — hero + featured cakes (today's bake) + about + chat CTA | Server |
| `/catalog` | All 5 SKUs, filterable by category | Server |
| `/product/[slug]` | One SKU detail (slug = `kitchenProductId`) | Server |
| `/order/[slug]` | Direct order form for one item | Server |
| `/c/[campaign_slug]` | Marketing-driven landing pages (UTM-aware) | Server |
| `/policies` | Pickup/delivery, allergens, lead times, refund | Server |
| `/about` | Sugar Land story, brand values | Server |
| `/api/catalog.json` | Agent-readable catalog | Route handler |
| `/api/availability?slug=X` | Live capacity per item | Route handler |
| `/api/policies.json` | Machine-readable policy facts | Route handler |
| `/api/order` | POST order intent | Route handler |
| `/api/order/[id]` | GET order status | Route handler |
| `/api/chat` | POST chat turn (spawns `claude -p`) | Route handler, Node runtime |
| `/api/escalation` | Internal: receive escalation from chat → forward to owner_bot | Route handler |
| `/llms.txt` | Agent index (text/markdown) | Route handler |
| `/sitemap.xml` | All product + policy URLs | Route handler |
| `/robots.txt` | Allow all bots | Route handler |
| `/evidence` (optional) | Last 24h system activity, JSON | Route handler |

Slugs are stable: they are exactly the `kitchenProductId` from MCP catalog. So `/product/whole-honey-cake`, `/product/honey-cake-slice`, `/product/pistachio-roll`, `/product/custom-birthday-cake`, `/product/office-dessert-box`.

## Product pages — required content per page

Each product page contains:

1. **Hero photo** — pulled from CDN by category (see `site/lib/assets.ts`).
2. **Name in brandbook format** — `cake "Honey"` for branded items, catalog name for others.
3. **One-sentence description** with two epithets max.
4. **Price** formatted from `priceCents` (`$55.00`).
5. **Lead time / availability badge** — driven by `kitchen_get_production_summary`:
   - `Ready today` (capacity available, item in today's bake)
   - `24h lead` (custom or office orders)
   - `Sold out today — order for tomorrow` (over capacity)
6. **Allergens** — grounded in catalog description, never invented. If MCP doesn't carry allergen data, link to `/policies#allergens` and don't invent specifics.
7. **Order CTA** — primary button `Order pickup` → `/order/[slug]`. Secondary `Ask about this cake` → opens chat widget pre-prompted with this product.
8. **JSON-LD `Product` schema** in `<head>`, server-rendered:
   ```html
   <script type="application/ld+json">
   { "@context": "https://schema.org/", "@type": "Product",
     "name": "cake \"Honey\" (whole)", "image": "...", "description": "...",
     "offers": { "@type": "Offer", "price": "55.00", "priceCurrency": "USD",
                 "availability": "https://schema.org/InStock" } }
   </script>
   ```

## Components

`site/components/`:

- `BrandHeader.tsx` — logo (CDN link), nav, chat icon.
- `BrandFooter.tsx` — address, hours, soft CTA, links.
- `CakeCard.tsx` — thumb + name + price + availability badge. Used in catalog and home.
- `AvailabilityBadge.tsx` — fetches `/api/availability?slug=X` server-side, shows `Ready today` / `24h lead` / `Sold out`.
- `OrderForm.tsx` — name, phone, pickup time, optional message-on-top (custom only). Submits to `/api/order`. On success, shows the `order_id` and ready-time.
- `AssistantWidget.tsx` — floating chat button → panel with conversation. POSTs to `/api/chat`. Streams response.
- `LeadCaptureModal.tsx` — "Talk to us" three-option modal (chat / WhatsApp deep link / order).
- `JsonLd.tsx` — server component that renders structured data into `<head>`.

## Customer journeys (the four flows)

The brief lists four conversion paths. Make them distinct, not generic.

### Birthday cake (default)

```
/  →  /catalog  →  /product/whole-honey-cake  →  /order/whole-honey-cake
                                                  │
                                  fields: name, phone, pickup datetime,
                                          optional "message on top" (free text)
                                                  │
                                                  ▼
                                  POST /api/order
                                  - server validates capacity via kitchen MCP
                                  - if OK: square_create_order → kitchen_create_ticket
                                  - returns { order_id, ready_at }
                                                  │
                                                  ▼
                                  /order/[order_id]/confirmation
```

### Office order (≥3 cakes implied)

When user adjusts qty on the order form to ≥3, or when they enter via `/order/office-dessert-box`:

```
/order/office-dessert-box
   fields: contact name, phone, headcount, delivery address (or pickup),
           billing preference (card / invoice), event date/time, notes
                                                  │
                                                  ▼
                                  POST /api/order with metadata.flow="office"
                                  - if qty * estimatedPrep > remainingCapacityMinutes:
                                      create order in 'pending_owner_approval' state
                                      escalate to owner_bot
                                  - else: normal flow with kitchen ticket
```

### Gift order

A toggle `[ ] Send as a gift` on the order form. When checked:

```
- recipient name and address replace billing-customer fields
- gift note text input appears
- "hide price in box" badge shows
- order metadata.flow="gift", hide_price=true
- buyer's contact stays for status updates
```

### Custom request (chat-led)

Any free-text request like *"Can I get a tiered cake for my wedding?"* triggers the on-site assistant. The assistant captures details, submits to the approval queue, owner approves/rejects/asks-for-clarification in Telegram. Only on approve does an actual order get created.

## Mobile-first specifics

- Test viewport: **375px** (iPhone SE / 13 mini width). Everything must work there before scaling up.
- Tap targets: **≥44px**.
- The chat widget on mobile takes the full lower half of the screen when open, not a tiny corner.
- No horizontal scroll on any page at any width down to 320px.
- Images: `<Image>` component with `sizes` attribute. Hero ≤200KB after compression (we get this for free since CDN is already optimized).

## Accessibility (WCAG AA target)

- Color contrast ≥4.5:1 for body text on cream backgrounds.
- Every `<img>` has descriptive `alt` (the metadata.json gives us those).
- All form fields have `<label>` associations.
- Chat widget keyboard-accessible (Tab through messages, Enter to send, Esc to close).
- Focus indicator visible.
- Skip-to-content link.

## SEO + structured data

- `<title>` and `<meta description>` per page.
- Open Graph + Twitter Card on home, product pages, campaign landing pages.
- `BakeryBreadShop` JSON-LD on home page with address (Sugar Land), hours, phone.
- `Product` + `Offer` JSON-LD on each product page.
- `BreadcrumbList` JSON-LD on product/category pages.
- Sitemap covers home, catalog, all 5 products, policies, about.
- `robots.txt` allows all crawlers.

## Performance budget

- Mobile Lighthouse target: Performance ≥90, A11y ≥95, SEO ≥95.
- LCP ≤2.5s, CLS <0.1, INP <200ms.
- Lazy-load images past the fold.
- No client-side data fetching for content above the fold.

## What it should look like (visually)

Reference the brandbook visual identity section:

- **Hero on home**: large cream background, hero photo from CDN, h1 in Cormorant Garamond ("The original taste of happiness"), one-sentence subheading in Inter, two CTAs (`Order today's bake` and `Talk to us`).
- **Catalog**: 2-column grid mobile, 3-column tablet, 4-column desktop. Each card on cream surface, no drop shadow, 0.5px border at 20% opacity.
- **Product page**: photo left (or top on mobile), details right. Price in `var(--happy-blue-700)`. Availability badge top-right.
- **Footer**: dark `var(--happy-blue-900)`, cream text, polka-dot awning pattern divider.

## What NOT to build

These don't earn points and eat hours:

- Login / accounts.
- Cart / multi-item checkout (one-item-at-a-time order is enough; office boxes are inherently single-item).
- Payment processing.
- Email signup forms (the brief doesn't mention email).
- Animated splash screens.
- Custom 404 page (default is fine).
- A blog.
- Multiple themes / dark mode.
