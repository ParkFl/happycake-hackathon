# Bonus opportunities — up to +15

The brief's evaluation section adds up to **15 bonus points** above the 100-point core, with a critical gating rule:

| Core score | Max bonus | Total cap |
|---|---|---|
| Core ≥ 80 | +15 | **115** |
| Core 60–79 | +5 | 84 |
| Core < 60 | 0 | 59 |

**The implication:** crossing the 80-core threshold is worth +10 points by itself. Don't chase bonus features at the expense of core. Once core is locked at 80+, bonus features are highly leveraged.

## The three bonus areas

Each can earn up to +5. We already cover several of these implicitly — the work below is mostly making them **explicit and provable**, not adding new code.

### Real business pain (+5 max)

The brief lists: *custom cake intake, complaints/refunds, allergy-safe communication, production capacity, repeat customers, reviews, abandoned orders.*

| Pain | Where in our system | What proves it |
|---|---|---|
| Custom cake intake | Owner-approval gate on `custom` category | A test custom-order in smoke log: drafted → owner approve in Telegram → order created → ticket created |
| Complaints / refunds | On-site assistant Test 3 (complaint) → escalation to owner | One complaint scenario in `mcp_audit_log` with escalation evidence |
| Allergy-safe comms | `/policies` page lists allergens; agent never invents allergen data, defers to policies | One assistant test where the customer asks about allergens and the agent quotes the policy verbatim |
| Production capacity | Kitchen automator with `remainingCapacityMinutes` check | Reject scenario in audit log when a hypothetical 17th cake of the day is requested |
| Repeat customers | Owner bot `/today` includes a "returning customers today" line, derived from `square_get_pos_summary` `bySource` + customer phone match | Mention in README + one screenshot |
| Reviews | Owner bot `/reviews` command | One Google review reply approved + sent in evidence |
| Abandoned orders | The chat tracks "asked about a cake but didn't order" sessions; an automated follow-up message after 2h via WhatsApp deep link or owner-bot ping | One abandoned-conversation event in audit log; documented in README |

**Easiest +5 here:** custom cake intake + complaints + reviews already covered architecturally. Just make sure each appears in the smoke evidence.

### Production readiness (+5 max)

The brief lists: *clean deploy, mobile performance, admin/operator view, audit trail, failure handling, safe owner handoff.*

| Aspect | What we already do | What to make explicit |
|---|---|---|
| Clean deploy | `make install`, `make verify`, `make dev`, `make smoke` | README walkthrough from fresh clone, no manual steps |
| Mobile performance | Next.js SSR + Tailwind + CDN images, Lighthouse target ≥90 | Run Lighthouse on the deployed site, paste score in README |
| Admin / operator view | Telegram owner bot is the operator view | Listed in README "Telegram bots" section with all commands |
| Audit trail | PostToolUse hook logs every MCP call to `logs/audit-*.jsonl` | README "Evidence trail" section with example `cat logs/audit-*.jsonl \| jq` output |
| Failure handling | `McpToolError.missingRequiredFields()` parser, graceful degradation on MCP outage | One README paragraph + a code reference |
| Safe owner handoff | All custom orders, all social posts, all review replies gated through approval queue | README documents the gate explicitly with screenshots |

**Easiest +5:** all already done in code, missing in **documentation**. 30-minute README pass closes this.

### Growth upside (+5 max)

The brief lists: *lead scoring, local SEO, referrals, WhatsApp follow-up, upsell logic, marketing budget optimization.*

| Aspect | Plan |
|---|---|
| Lead scoring | When `marketing_generate_leads` returns leads, sort them by `estimatedOrderValueUsd` desc + `intent` heuristic. High-value leads get prioritized routing to fastest channel. |
| Local SEO | `BakeryBreadShop` JSON-LD with Sugar Land address; `LocalBusiness` schema; sitemap; OpenGraph; Google Business posts via the (discoverable) `gbusiness_*` tools |
| Referrals | A "share" button on the order confirmation page that prefills a WhatsApp message: *"Just ordered cake \"Honey\" from HappyCake — they have a slot Saturday if you want to grab one too"* with the deep link |
| WhatsApp follow-up | After order is `completed`, one automated thank-you message 24h later asking for a Google review, deep-linked to the GBP listing |
| Upsell logic | When ordering a slice, the chat suggests adding another slice or asks about a whole cake for the weekend. When ordering a whole cake, chat asks about candles or office add-ons. |
| Marketing budget optimization | The marketing report includes a "next-cycle adjustment" — channel with worst CPA gets reduced 20%, channel with best CPA gets the difference. Documented in `MARKETING_PLAN.md` |

**Easiest +5:** local SEO (1h) + WhatsApp follow-up (1h) + lead scoring sort logic (30min). These three alone should land 4–5 of 5.

## Total bonus realistic target

If core hits 80+, getting **+10–12 bonus** is achievable within the remaining budget by:

1. README polish to make existing safety/audit/owner-handoff explicit (+4 production)
2. Custom-cake + complaint + review evidence in smoke log (+4 business pain)
3. Local SEO schemas + WhatsApp follow-up + lead-value sort (+3-4 growth)

**Don't reach for bonus before core ≥80.** Confirm with `evaluator_generate_team_report` that core dimensions sum to 80+ before allocating any time to bonus features. The fastest path: close Channel response (0→100) and Kitchen handoff (65→100). Those two alone push core well past 80.
