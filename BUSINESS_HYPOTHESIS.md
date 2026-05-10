# Business impact hypothesis

## About HappyCake

HappyCake is a Kazakhstan-rooted bakery; the first US location opened in **Sugar Land, Texas in summer 2024** at 350 Promenade Way, Suite 500. The shop runs Tue–Sat 11 AM–7 PM and Sun 12 PM–6 PM. Phone: (281) 979-8320 · Instagram: [@happycake.us](https://www.instagram.com/happycake.us/).

The catalog the system actually sells from is the 5-SKU sandbox feed (`square_list_catalog`):

| SKU | Price | Margin |
|---|---:|---:|
| Honey cake slice | $8.50 | 68% |
| Whole honey cake | $55.00 | 62% |
| Pistachio roll | $9.50 | 64% |
| Custom birthday cake (owner approval required) | $95.00 | 58% |
| Office dessert box | $120.00 | 60% |

Behind the counter the team keeps a working book of 30+ time-tested recipes; the daily bake rotates with the season.

## Today's reality

Per `marketing_get_sales_history`, the last 6 months look like this:

| Month | Revenue | Orders | Avg ticket |
|---|---:|---:|---:|
| Apr 2026 (latest) | **$18,320** | **724** | **$25.30** |
| Mar 2026 | $17,640 | 691 | $25.53 |
| Feb 2026 | $16,890 | 668 | $25.28 |
| Jan 2026 | $15,110 | 621 | $24.33 |
| Dec 2025 | $19,240 | 738 | $26.07 |
| Nov 2025 | $14,820 | 612 | $24.22 |

**6-month average: ~$17,000/month, ~676 orders/month, $25.10 avg ticket.** Trend: 1.5–4% MoM growth, with December's bump from holiday gifting.

What's currently broken vs what the customer-facing system needs to be:

- **WhatsApp**: one number, owner answers manually. Customers wait, sometimes give up.
- **Instagram**: feels like a window display — no DM-to-order pipeline.
- **Website**: placeholder. No catalog, no order intake.
- **Marketing**: $500/month with no allocation logic and no attribution.

## Sugar Land context

Wealthy Houston suburb. Median household income above $110K. Multicultural — Anglo, Hispanic, South Asian, East Asian, Central Asian diaspora, Middle Eastern. Family-oriented, suburban, school-and-church anchored. People drive everywhere; they make decisions on the way home.

Most HappyCake customers either live within ten miles or work nearby. We do not chase travel buyers — we are a neighbourhood place that competes with home baking, not with the bakery across town.

## Competitive positioning

The Sugar Land bakery scene has three notable competitors:

| Competitor | Position | What HappyCake offers instead |
|---|---|---|
| 85°C Bakery Cafe (Highway 6) | Asian-style pastries + bread, fast-casual | Traditional honey-cake / pistachio-roll lineup, hand-decorated, Kazakhstan recipe heritage |
| Nothing Bundt Cakes (Sugar Land Town Center) | Standardised single-form cakes, large chain | One-of-a-kind family recipes, local ownership, custom messages on cakes |
| Bakers Avenue (First Colony) | Western-style bakery, broad menu | Narrow, deep menu — proven recipes, consistent quality, instant counter availability |

HappyCake's differentiation is the brand book itself: *"the original taste of happiness"*, family recipes that earned their names over years, a voice that doesn't shout, a kitchen that's honest about what's ready when. That voice is what the AI system encodes — every reply on every channel sounds like the same neighbour at the kitchen counter on a Tuesday morning.

## What this system changes (the hypothesis)

| Lever | Today | After this system | Source of lift |
|---|---|---|---|
| WhatsApp response time | Hours, sometimes never | Seconds, 24/7 | `/sales` agent answers from real catalog + capacity |
| WhatsApp → confirmed order | ~10–15% (estimated, manual) | 30–40% | Brand-voice replies + capacity-honest offers |
| Instagram DM → confirmed order | ~0% | 10–15% | DM agent + post-driven catalog links |
| Website → order | 0% (placeholder) | New channel | `happycake.us` candidate site (live at [happycake-us.vercel.app](https://happycake-us.vercel.app)) |
| Marketing $500 effective return | unmeasured | ~$1,560 first-cycle, ~$5,000 trailing-90-day | Closed-loop attribution per [MARKETING_PLAN.md](MARKETING_PLAN.md) |
| Repeat-customer rate | ad-hoc | systematic | WhatsApp follow-up 24h after pickup |
| Owner time on order intake | hours/day | minutes/day for approvals only | Telegram approve / reject / edit inline buttons |
| Live-takeover when bot fails | not possible (no system) | Telegram alert with full context + WhatsApp deep link to customer | `/sales` escalation + owner_bot `/site-chat` push |

## The numbers — first month after deployment

**Conservative model**: April 2026 baseline of $18,320 = 724 orders. The lift comes from converting the inbound that today drops because the owner can't reply fast enough, plus the $500 marketing cycle.

| Stream | April 2026 today | +System (May 2026) | Delta |
|---|---:|---:|---:|
| Walk-in (unchanged — system doesn't change in-store) | ~$15,000 | $15,000 | $0 |
| WhatsApp orders (faster reply, capacity-honest, brand voice) | ~$2,000 (estimated from manual log) | ~$5,000 | +$3,000 |
| Instagram DM orders (new channel via DM agent) | $0 | ~$1,500 | +$1,500 |
| Website orders (new — `happycake-us.vercel.app` catalog + chat + cart) | $0 | ~$1,000 | +$1,000 |
| Marketing-attributed orders ($500 spend, 1× cycle, per `MARKETING_PLAN.md`) | $0 | ~$1,560 | +$1,560 |
| **Monthly total** | **~$17,000** | **~$24,060** | **+$7,060** |

That's a **~41% revenue lift** in month 1. Conservative because:

- Walk-in stays flat (the system doesn't change in-store).
- Marketing's 90-day LTV multiple is unmodelled here — the +$1,560 is just the same-cycle attribution.
- No price changes, no menu expansion.
- Instagram and Website lifts are first-month — both grow as content + reviews compound.

**At margin (62% blended):** GP delta is ~$4,380 in month 1. The $500 marketing spend pays back in two weeks on margin alone.

## The 90-day window

Add the LTV / retargeting / referral effects per [MARKETING_PLAN.md](MARKETING_PLAN.md) bridge:

- **30%** of first-time customers from marketing become repeat customers within 90 days
- WhatsApp follow-up at +24h after pickup → review request → **15%** of pickups produce a Google review (industry baseline for small bakery with active outreach)
- Reviews lift Google Business discovery → **~10%** increase in organic-search inbound by day 90
- Brand-voice halo on cross-channel: a Meta-ad viewer who doesn't click but later searches Google or walks in is captured via `marketing_route_lead` attribution

Compounded, the trailing-90-day revenue from the $500 marketing spend reaches **~$5,000** (the brief's target). Total trailing-90-day revenue lift over today's run-rate: **~$25–30K** (the system effect on top of the $51K baseline three-month run-rate).

## Owner-time savings

| Today | Future |
|---|---|
| Owner manually types every WhatsApp reply | Bot answers in brand voice; owner reviews end-of-day audit |
| Owner takes orders, walks to kitchen, updates customer | Order → kitchen ticket → status updates automated; owner only approves custom + complaints |
| Owner manually checks reviews | `/owner reviews` queue with on-brand drafts to approve / edit / skip |
| **Estimated 2–3 hours/day on order intake** | **Estimated 20–30 minutes/day on approvals + audit** |

Saves ~2 hours/day, redirected to baking, hiring, or rest.

## What this system does **not** promise

- **It does not increase walk-in foot traffic on its own.** That requires neighbourhood marketing, signage, partnerships — out of scope here. (Walk-in remains the largest revenue stream and is preserved unchanged.)
- **It does not let the kitchen produce more cakes than it can.** Capacity is a hard constraint at ~16 whole cakes/day; marketing throttles when capacity tightens (see [MARKETING_PLAN.md](MARKETING_PLAN.md) capacity-throttle section).
- **It does not work without owner engagement.** Approvals must happen for custom orders, complaint resolutions, social posts, and marketing campaigns. The owner is in the loop, just no longer in the hot path.
- **It does not replace the owner's judgement on tone in edge cases.** When the bot escalates, the conversation goes to Telegram with full context and a one-tap WhatsApp link to reach the customer.

## Failure modes and mitigations

| Risk | Mitigation |
|---|---|
| Sandbox MCP outage during eval | Graceful degradation: cached catalog (60s TTL), polite fallback messages with the real shop phone (281) 979-8320, escalation to owner |
| Owner doesn't approve a custom order in time | After 1h with no response, agent messages customer with realistic alternative + apology; queue item stays pending so owner can still resolve |
| Marketing campaign overdrives capacity | Capacity-aware ad-delivery throttle: pause when `remainingCapacityMinutes < 60`; auto-flip landing copy to "pre-order for tomorrow" |
| AI agent misquotes a price | Structural impossibility — every price comes from `square_list_catalog` at runtime; brand self-check rejects responses without `facts_used` citations |
| Customer escalates angrily and bot can't resolve | `/sales` flags `escalation` in JSON envelope → owner_bot pushes Telegram message with full transcript + customer phone + WhatsApp deep link; owner takes over within minutes |
| Negative review goes unanswered | Owner bot `/reviews` queue, draft within 30 min of detection, 24h SLA for owner approval |
| Customer wants live human in-chat | "Hand off to team" button in widget triggers immediate Telegram alert; customer sees "I've flagged this for the team — someone will jump in within minutes" |

## Production handoff

Per [ARCHITECTURE.md](ARCHITECTURE.md), all integrations go through wrappers whose signatures match real-API shapes:

| Sandbox tool | Real-API equivalent | Switch via |
|---|---|---|
| `square_list_catalog`, `square_create_order`, `square_update_order_status` | Square Catalog/Orders APIs | `HAPPYCAKE_MODE=production` + Square OAuth env vars |
| `kitchen_*` | Custom kitchen-display board (Square POS extension or partner KDS) | Same flag — adapter swap |
| `whatsapp_send`, `whatsapp_inject_inbound` | WhatsApp Business Cloud API (Meta) | WA Business token + verified phone |
| `instagram_*` | Instagram Graph API | Meta Business Suite OAuth |
| `gb_simulate_reply`, `gb_list_reviews` | Google Business Profile API | Google OAuth + verified location |
| `marketing_*` | Meta Ads + Google Ads APIs | Meta + Google Ads tokens |

Switching from sandbox to production is an env-var flip plus filling real OAuth credentials. No re-architecture. The customer-facing site, the chat widget, the Telegram bot, the kitchen automator, and the brand prompt all keep working unchanged.
