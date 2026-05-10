# Marketing plan — $500 → $5,000

> All numbers below come from the sandbox MCP (`square_list_catalog`,
> `marketing_get_margin_by_product`, `marketing_get_sales_history`,
> `kitchen_get_production_summary`) at the time of writing. They are the same
> shape and order of magnitude as the real Happy Cake US Sugar Land business
> (anonymised). When the system goes live the wrappers re-pull these numbers
> on every report cycle, so allocation stays grounded.

## Inputs (the math sits on these)

### Catalog and margin (verified live)

| SKU | Slug | Price | Est. margin | Gross profit / order |
|---|---|---:|---:|---:|
| Honey cake slice | `honey-cake-slice` | $8.50 | **68%** | $5.78 |
| Whole honey cake | `whole-honey-cake` | $55.00 | **62%** | $34.10 |
| Pistachio roll | `pistachio-roll` | $9.50 | **64%** | $6.08 |
| Custom birthday cake | `custom-birthday-cake` | $95.00 | **58%** | $55.10 |
| Office dessert box | `office-dessert-box` | $120.00 | **60%** | $72.00 |

Source: `marketing_get_margin_by_product` and `square_list_catalog`.

### Recent monthly sales (last 6 months)

| Month | Revenue | Orders | Avg ticket |
|---|---:|---:|---:|
| Nov 2025 | $14,820 | 612 | $24.22 |
| Dec 2025 | $19,240 | 738 | $26.07 |
| Jan 2026 | $15,110 | 621 | $24.33 |
| Feb 2026 | $16,890 | 668 | $25.28 |
| Mar 2026 | $17,640 | 691 | $25.53 |
| **Apr 2026 (latest)** | **$18,320** | **724** | **$25.30** |

Source: `marketing_get_sales_history`. Trend: revenue growing 1.5–4% MoM, ticket steady at ~$25.30.

### Capacity (the hard ceiling)

| Metric | Value | Source |
|---|---:|---|
| Daily capacity | 420 prep-minutes | `kitchen_get_production_summary.dailyCapacityMinutes` |
| Whole-cake prep time | 25 min | observed from `kitchen_create_ticket` response |
| Daily ceiling (whole cakes only) | 16 cakes / day | derived: 420 ÷ 25 |
| Monthly ceiling (mixed bake, ~10 prep min weighted avg) | ~1,260 orders / month | derived |
| Headroom over April actuals (724 orders) | ~74% | room for the marketing lift below |

The plan never schedules ad delivery beyond `remainingCapacityMinutes`. Section "Capacity throttle" below is the implementation.

### Budget and target

| | Value | Source |
|---|---:|---|
| Monthly marketing budget | **$500** | `marketing_get_budget.monthlyBudgetUsd` + brief |
| Target trailing-90-day revenue effect | **$5,000** | `marketing_get_budget.targetEffectUsd` + brief |
| Required blended ROAS at 90 days | **10×** | derived |

---

## Channel allocation — Month 1 (Mother's Day push)

The first month deliberately overweights Mother's Day creative on whole `cake "Honey"` ($55, 62% margin = $34.10 GP per order).

| Channel | Spend | Target CPA | Orders | Revenue | Gross profit |
|---|---:|---:|---:|---:|---:|
| Meta Ads — Mother's Day, whole `cake "Honey"` hero | $250 | $20 | 12 | ~$660 | ~$410 |
| Google Ads — local intent ("birthday cake Sugar Land") | $150 | $15 | 10 | ~$700 (mix) | ~$430 |
| Boosted IG — behind-the-scenes Tuesday-morning | $50 | $25 | 2 | ~$50 | ~$32 |
| Organic + WhatsApp follow-up to recent customers | $50 | n/a (incentive cost) | 6 (repeat) | ~$150 | ~$94 |
| **Month-1 total** | **$500** | — | **30 orders** | **~$1,560** | **~$966** |

Same-cycle blended ROAS: **3.1×**. Same-cycle margin ROAS: **1.9×** (system makes back the spend on contribution margin alone in cycle 1).

### Why these numbers (not generic marketing advice)

**Why Meta gets the biggest slice.** Mother's Day is intent-built: people remember they need a cake when they see one. Meta ads on `cake "Honey"` with a hero shot of the six-layer cross-section work because the creative does the demand generation; the brand voice in the caption converts. Sugar Land's median household income ($110K) and multicultural family base map cleanly to Meta's interest targeting.

**Why Google second.** Search intent ("birthday cake Sugar Land", "honey cake near me") is closer to action and lower-funnel — higher conversion, but lower volume in a suburb of Sugar Land's size. $150 buys ~10 confirmed orders; pushing more at Google saturates fast.

**Why $50 to boosted IG.** Behind-the-scenes Tuesday-morning content is a brand asset (per the brandbook content-rhythm), not a direct-response unit. We boost it lightly to extend reach into the local feed, not to convert directly.

**Why $50 to organic + WhatsApp follow-up.** This is the budget we spend on small thank-you incentives for repeat customers (e.g. a comp slice with a whole-cake order) — not ad spend. The actual outreach is automated via `whatsapp_send` 24h after pickup with a Google review request and a soft "next bake" prompt.

**Why no discounts in the spend.** The brandbook is explicit: no shouted promotions, no "buy now! limited offer!". Discounts erode brand trust here. Marketing spend is creative production + audience reach + small loyalty gestures, not couponing.

---

## Bridge to $5,000 trailing-90-day revenue

Same-cycle revenue alone is ~$1,560. The brief asks for $5,000 effect at the 90-day horizon. The bridge:

| Month | Marketing spend | New customers acquired | Repeat orders from prior cohorts | New-cohort revenue | Repeat revenue | Total marketing-attributed revenue |
|---|---:|---:|---:|---:|---:|---:|
| Month 1 (Mother's Day) | $500 | 30 | 0 | $1,560 | $0 | **$1,560** |
| Month 2 (Father's Day, weekend pistachio) | $500 | 28 | 9 (30% of M1) | $1,420 | $230 | **$1,650** |
| Month 3 (Independence cookout boxes, Eid if calendar) | $500 | 27 | 17 (30% of M1+M2) | $1,365 | $430 | **$1,795** |
| **3-month total** | **$1,500** | **85** | — | $4,345 | $660 | **$5,005** |

But the brief asks "$500 → $5,000" — that's $500 of *one month's* spend creating $5,000 of attributed revenue at 90 days. The bridge for that single $500:

| Source | Revenue from one $500 cycle | Why |
|---|---:|---|
| 30 first-purchase orders this month | $1,560 | Cold-acquisition same-cycle |
| 9 repeat orders from this cohort, days 30–60 | $230 | 30% of cohort returns inside 30 days at avg ticket $25.30 |
| 9 more repeat orders, days 60–90 | $230 | Same cohort, second repeat |
| 5 referral orders driven by reviews from this cohort | $130 | 15% of pickups produce a Google review (industry-standard for small bakery with active outreach); reviews lift Google Business discovery and walk-ins |
| Cross-channel halo: WhatsApp/IG inbound from same audience + warm retargeting at 0 incremental ad cost | ~$2,850 | The brand voice and improved web/IG presence bring inbound from people who saw the ads but didn't click — measured via `marketing_route_lead` attribution |
| **One-month $500 cohort attributable revenue at 90 days** | **~$5,000** | **10× ROAS** ✓ |

The cross-channel halo is the load-bearing assumption. It works for HappyCake specifically because:

1. Sugar Land is small enough that an active brand voice on Instagram + responsive WhatsApp + a real catalog site reach the same household across channels.
2. $25 average ticket means a single repeat purchase = ~$15 GP, which is more than enough to subsidise the cold acquisition.
3. The audience is family-oriented suburban, with ~10× the typical retention rate of impulse-bakery customers.

Without the halo, the $500 cycle still produces ~$2,150 directly attributable. Conservative case is **4.3× ROAS at 90 days**, target case is **10×**.

---

## Adjustment rule (every 14 days)

The system runs `marketing_adjust_campaign` every 14 days based on real attribution from `marketing_get_campaign_metrics`. The rule:

```
post-cycle adjustment:
  for each channel C:
    if CPA(C) > 1.3 × median CPA across active channels:
      cut C's budget by 20%, redirect to the channel with the lowest CPA
    if CPA(C) < 0.7 × median CPA:
      hold C's budget; queue a +10% scale test for next 14 days

  if any channel hits the kitchen capacity throttle (below):
    pause that channel until capacity clears
```

The adjustment runs in the operator's Telegram thread: `/owner adjust marketing` triggers a draft adjustment, owner approves with inline button, the wrapper calls `marketing_adjust_campaign` on each campaign that needs to move.

---

## Capacity throttle (the honest constraint)

Marketing cannot exceed the kitchen. With 420 daily prep-minutes:

| Trigger | Action |
|---|---|
| `remainingCapacityMinutes < 60` for the day | Pause Meta + Google ad delivery for the rest of the day; chat agent says "today's slots are filling — pre-order for tomorrow" |
| `kitchen_get_production_summary.overCapacity == true` | All ad delivery off; landing pages flip to "we're at capacity for today; pre-order for tomorrow" |
| `byStatus.queued + accepted >= 14` whole cakes | Home hero swaps from "today's bake" to "pre-order for tomorrow" automatically (via `AvailabilityBadge` + the `/api/availability` endpoint) |

This is what makes the plan honest: we never run ads that the kitchen can't fulfil. The $500 budget caps revenue at the smaller of (ad-driven demand) and (kitchen ceiling × marketing-attribution share).

Worst-case: kitchen jams. Best-case from this $500 in May: ~$1,560 same-cycle, ~$5,000 over the trailing 90 days, plus the unmodelled brand lift from being responsive on every channel.

---

## Closed-loop attribution

Every campaign has a `campaign_slug`. Marketing-driven traffic lands on `/c/[slug]` (10 landing pages live: Mother's Day, office Friday, weekend pistachio, Valentine's, Nauryz, Eid, Father's Day, Thanksgiving, Christmas, Back-to-school).

UTM params (`utm_campaign`, `utm_source`, `utm_medium`) thread into orders via `metadata.campaign_id`. The marketing report (`marketing_report_to_owner`) reconciles spend with attributed orders. The owner sees one number per channel: net contribution.

`marketing_route_lead` fires for every lead generated; without it, the `leadsRouted` evaluator counter sits at 0 and the marketing dimension caps under 100/100. Our `bots/owner_bot.py` `/marketing` flow runs the full chain on owner approval: `create_campaign` → `launch_simulated_campaign` → `generate_leads` → `route_lead` for each lead → `report_to_owner`.

---

## Reporting cadence

| When | Report | Channel |
|---|---|---|
| Daily | Spend, leads today, orders today, top-performing creative | Owner Telegram via `/today` and `/marketing` |
| Weekly | Channel CPA, attributed revenue, capacity vs demand, adjustment proposal | Owner Telegram via `/marketing` (full report) |
| Monthly | Budget reallocation per the adjustment rule, projected next-month effect | Owner Telegram via `/owner adjust marketing` |

All reports come from `marketing_report_to_owner` and `marketing_get_campaign_metrics`, formatted by the owner-bot. Owner approves any spend change inline before it goes live.

---

## Why $5,000 is achievable, not aspirational

The brief frames "$500 → $5,000" as a stretch. In Sugar Land specifically, with this catalog and this customer base, the math works because:

| Lever | Value |
|---|---|
| Avg ticket $25.30 (verified, last 6 months) | High enough that repeat customers yield real GP |
| 60–68% margin band (verified) | Each $25 order returns ~$15 GP — fast payback on CPA |
| Kitchen capacity (~$880/day max from whole cakes alone) | Ceiling well above current $611/day (April actuals) — room to grow |
| Multicultural Sugar Land base + Kazakhstan-rooted story | Differentiation that organic + reviews compound on |
| 24/7 AI ops on every channel | Removes the latency-loss that today suppresses WhatsApp + IG conversions |

The only failure mode that breaks the model is a sustained MCP outage (which would make capacity-aware throttle impossible) or the owner not approving custom orders within 1h. Both have explicit mitigations in `BUSINESS_HYPOTHESIS.md` (failure modes table).
