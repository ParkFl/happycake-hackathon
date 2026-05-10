# MCP — concrete schemas (verified)

This file is the verified, runtime-tested reference for the happycake MCP. It supersedes any guesswork in CLAUDE.md or the brief. Raw responses live in `research/mcp-schema-dump.json`.

**Source of truth precedence when in doubt:** live MCP response > this file > CLAUDE.md > brief.

---

## Common conventions across all tools

- All money values are in **cents** (`priceCents`, `revenueCents`, `totalCents`). Format as `$X.XX` for any UI output.
- All status strings are **lowercase**: `open`, `in_kitchen`, `ready`, `completed`, `cancelled`, `queued`, `accepted`, `rejected`.
- Timestamps are ISO 8601 in UTC: `2026-05-09T20:19:35.670Z`.
- Camel-case keys throughout. `customerName`, `customerPhone`, `priceCents`, `kitchenProductId`, `targetAudience`.
- Errors return `{"isError": true, "content": [{"type": "text", "text": "Error: <message>"}]}`. Always parse `text` for "Error:" prefix.

---

## 1. Square / POS

### `square_list_catalog` — read catalog

Request: `{}`

Response (the actual sandbox catalog has **5 SKUs**):

```json
{
  "mode": "simulated",
  "catalog": [
    {
      "id": "sq_item_honey_cake_slice",
      "variationId": "sq_var_honey_cake_slice",
      "name": "Honey cake slice",
      "category": "slices",
      "priceCents": 850,
      "description": "Individual honey cake slice for walk-ins and quick pickup.",
      "kitchenProductId": "honey-cake-slice"
    },
    {
      "id": "sq_item_whole_honey_cake",
      "variationId": "sq_var_whole_honey_cake",
      "name": "Whole honey cake",
      "category": "whole-cakes",
      "priceCents": 5500,
      "description": "Classic whole honey cake for family orders.",
      "kitchenProductId": "whole-honey-cake"
    },
    {
      "id": "sq_item_pistachio_roll",
      "variationId": "sq_var_pistachio_roll",
      "name": "Pistachio roll",
      "category": "slices",
      "priceCents": 950,
      "description": "Premium pistachio roll dessert.",
      "kitchenProductId": "pistachio-roll"
    },
    {
      "id": "sq_item_custom_birthday_cake",
      "variationId": "sq_var_custom_birthday_cake",
      "name": "Custom birthday cake",
      "category": "custom",
      "priceCents": 9500,
      "description": "Custom celebration cake with human approval required.",
      "kitchenProductId": "custom-birthday-cake"
    },
    {
      "id": "sq_item_office_dessert_box",
      "variationId": "sq_var_office_dessert_box",
      "name": "Office dessert box",
      "category": "catering",
      "priceCents": 12000,
      "description": "Assorted dessert box for offices and events.",
      "kitchenProductId": "office-dessert-box"
    }
  ]
}
```

**Key takeaways:**
- Categories are `slices`, `whole-cakes`, `custom`, `catering`. The site can group by these.
- `custom` category items **require owner approval** — the description literally says so.
- The brandbook mentions cake "Napoleon", cake "Milk Maiden", cake "Tiramisu" as classics — **they are not in this catalog**. Treat them as voice/style examples, never as orderable products.

### `square_create_order` — create an order

Request:

```json
{
  "items": [
    { "variationId": "sq_var_whole_honey_cake", "quantity": 1 }
  ],
  "customerPhone": "+18325550199",
  "customerName": "Alibi"
}
```

**Important:** the field is `variationId`, NOT `productId`. The catalog gives you the `variationId` for each item.

Response:

```json
{
  "mode": "simulated",
  "order": {
    "id": "sq_order_1778357975670",
    "source": "agent",
    "customerName": "Alibi",
    "items": [
      {
        "variationId": "sq_var_whole_honey_cake",
        "quantity": 1,
        "name": "Whole honey cake",
        "priceCents": 5500,
        "kitchenProductId": "whole-honey-cake"
      }
    ],
    "totalCents": 5500,
    "status": "open",
    "kitchenHandoffRecommended": true,
    "createdAt": "2026-05-09T20:19:35.670Z",
    "updatedAt": "2026-05-09T20:19:35.670Z"
  },
  "kitchenTool": "kitchen_create_ticket"
}
```

**The response tells you the next tool to call** (`kitchenTool`). Use that wiring — don't hardcode the chain.

### `square_update_order_status` — change status

Request:

```json
{ "orderId": "sq_order_1778357975670", "status": "in_kitchen" }
```

**Status must be lowercase.** Valid transitions inferred from the chain: `open` → `in_kitchen` → `ready` → `completed`. Plus `cancelled` as terminal.

Errors: `"Error: Order not found"` if `orderId` doesn't exist (don't pass made-up IDs).

### `square_get_pos_summary` — POS dashboard

Request: `{}`

Response:

```json
{
  "mode": "simulated",
  "orders": 2,
  "revenueCents": 11000,
  "byStatus": { "open": 2 },
  "bySource": { "agent": 2 },
  "events": 2,
  "kitchenHandoffRecommended": 2
}
```

`bySource.agent` counts orders created by our system (vs `walkin`, etc., when those surface).

---

## 2. Kitchen

### `kitchen_get_production_summary` — capacity check

Request: `{}`

Response:

```json
{
  "tickets": 0,
  "byStatus": {},
  "events": 0,
  "dailyCapacityMinutes": 420,
  "usedPrepMinutes": 0,
  "remainingCapacityMinutes": 420,
  "overCapacity": false
}
```

**420 minutes = 7 hours daily capacity.** Combined with `estimatedPrepMinutes: 25` for a whole honey cake, this means roughly **16 whole cakes per day** is the ceiling. Use `remainingCapacityMinutes` for real-time overpromise prevention.

### `kitchen_create_ticket` — production handoff

Request:

```json
{
  "orderId": "sq_order_1778357975670",
  "customerName": "Alibi",
  "items": [
    { "productId": "whole-honey-cake", "quantity": 1 }
  ]
}
```

**Critical schema gotcha:** kitchen uses `productId`, NOT `variationId`. The value is the `kitchenProductId` from `square_list_catalog`. Mapping:

| Catalog `variationId` | Kitchen `productId` |
|---|---|
| `sq_var_honey_cake_slice` | `honey-cake-slice` |
| `sq_var_whole_honey_cake` | `whole-honey-cake` |
| `sq_var_pistachio_roll` | `pistachio-roll` |
| `sq_var_custom_birthday_cake` | `custom-birthday-cake` |
| `sq_var_office_dessert_box` | `office-dessert-box` |

Response:

```json
{
  "ticketId": "kt_1778357976618",
  "status": "queued",
  "ticket": {
    "id": "kt_1778357976618",
    "orderId": "sq_order_1778357975670",
    "customerName": "Alibi",
    "items": [{ "productId": "whole-honey-cake", "quantity": 1 }],
    "status": "queued",
    "estimatedPrepMinutes": 25,
    "estimatedReadyAt": "2026-05-09T21:19:36.618Z",
    "createdAt": "2026-05-09T20:19:36.618Z"
  }
}
```

### `kitchen_accept_ticket` — kitchen accepts the work

Request:

```json
{ "ticketId": "kt_1778357976618", "estimatedMinutes": 25 }
```

Errors: `"Error: Ticket not found"` if ticket id is bad. Use only ticketIds returned by `kitchen_create_ticket`.

### `kitchen_reject_ticket` — kitchen refuses (over capacity)

Request:

```json
{ "ticketId": "kt_1778357976618", "reason": "Kitchen is over capacity" }
```

Use this when `remainingCapacityMinutes < estimatedPrepMinutes` for the new ticket. Critical for the "no overpromising" hard rule and the "capacity-aware accept/reject" evaluator gap.

---

## 3. Marketing

### `marketing_create_campaign` — create campaign draft

**Required fields (all of them):** `name`, `channel`, `objective`, `targetAudience`, `offer`.

A request that omits any of these returns:
```
Error: name, channel, objective, targetAudience, and offer are required
```

Working request shape:

```json
{
  "name": "Mother's Day Honey Cake",
  "channel": "instagram",
  "objective": "drive_orders",
  "targetAudience": "Sugar Land women 25-65, family-celebration intent",
  "offer": "10% off cake \"Honey\" pre-orders for Mother's Day weekend",
  "budgetUsd": 250
}
```

Note: the field is `channel` (not `platform`).

### `marketing_launch_simulated_campaign`

Request: `{ "campaignId": "<id from create>" }`

`"Error: Campaign not found"` for unknown ids.

### `marketing_generate_leads`

Request: `{ "campaignId": "<id>" }`

Response (real shape):

```json
{
  "generated": 3,
  "leads": [
    {
      "id": "lead_1778357977809_1",
      "campaignId": "camp_123",
      "customerName": "Maya R.",
      "channel": "instagram",
      "intent": "birthday cake for Saturday",
      "estimatedOrderValueUsd": 95
    }
  ]
}
```

Lead `channel` values seen so far: `instagram`, `google_local`, `website`. The `intent` is human-readable — useful as the customer's first-message context when routing the lead through `/sales`.

### `marketing_report_to_owner`

Request: `{}`

Response:

```json
{
  "budgetUsd": 500,
  "targetEffectUsd": 5000,
  "campaignsCreated": 0,
  "launches": 0,
  "leadsGenerated": 6,
  "leadsRouted": 0,
  "adjustments": 0,
  "projectedRevenueUsd": 0,
  "ownerSummary": "Marketing simulator summary: ...",
  "reportedAt": "..."
}
```

The numbers in the report are the metrics the evaluator's `marketing loop` dimension uses for scoring. Drive `campaignsCreated`, `launches`, `leadsRouted`, `adjustments`, `projectedRevenueUsd` to all be > 0 in the demo run.

---

## 4. World — scenarios

`world_start_scenario({ "scenarioId": "test" })` returns `"Error: Unknown scenarioId"`. The valid scenarioIds are not listed in the dump and **must be obtained from the hackathon organisers** (likely public-practice IDs for our own dev/test). At judging time, the evaluator activates secret scenarios that we don't see.

`world_next_event({})` — pulls next event from active scenario timeline. Returns `"Error: No active scenario"` if nothing is running. **Our channel wrappers should poll this on a 5-second interval** when in scenario mode (or be triggered by a webhook adapter).

`world_advance_time({ "minutes": 30 })` — fast-forward the simulated clock. Same "No active scenario" error guard.

`world_get_scenario_summary({})` — returns `{ "status": "not_started"|"running"|"completed", "timelineEvents": N }`. Cheap to poll.

**For the world dimension to score full marks**, evidence must show: `world_start_scenario` was called with a valid id, `world_next_event` returned events, and the system reacted to them. The current 40/100 reflects "no active scenario run".

---

## 5. Channels — discovered (verified 2026-05-10)

`tools/list` confirmed all three channel suites. **Important name correction**: Google Business tools are `gb_*` (not `gbusiness_*` as guessed in the brief). The evaluator counters keep the long names (`gbusinessReviews`/`gbusinessReplies`) but the tool names are short.

### 5.1 WhatsApp — `whatsapp_*` (4 tools)

| Tool | Required args | Notes |
|---|---|---|
| `whatsapp_register_webhook` | `url` (HTTPS) | Register ngrok URL once at startup so sandbox forwards inbound DMs to our wrapper |
| `whatsapp_inject_inbound` | `from` (E.164), `message` | **Test-only**: simulate inbound DM. Used by evaluator AND by us for smoke tests |
| `whatsapp_send` | `to` (E.164), `message` (English) | Outbound; `to` must be on team's whitelisted simulated customers list |
| `whatsapp_list_threads` | none | Recent conversations the team has handled |

Counters fed: `whatsappInbound` (from `whatsapp_inject_inbound` + webhook deliveries), `whatsappOutbound` (from `whatsapp_send`).

### 5.2 Instagram — `instagram_*` (8 tools)

| Tool | Required args | Notes |
|---|---|---|
| `instagram_register_webhook` | `url` (HTTPS) | DM + comment events forwarded here |
| `instagram_inject_dm` | `threadId`, `from`, `message` | Test-only inbound DM injection |
| `instagram_list_dm_threads` | none | Read recent threads |
| `instagram_send_dm` | `threadId`, `message` | Outbound DM |
| `instagram_reply_to_comment` | `commentId`, `message` | Comment reply |
| `instagram_schedule_post` | `imageUrl`, `caption` (`scheduledFor` optional ISO 8601) | Returns `scheduledPostId`. **Never publishes directly** — owner approval required |
| `instagram_approve_post` | `scheduledPostId` | Owner-side helper called from Telegram bot when owner taps Approve |
| `instagram_publish_post` | `scheduledPostId` | Errors if not yet approved by owner. Enforces the safe-handoff rule |

Counter fed: `instagramActions` (sum of DM sends, comment replies, post publishes).

**Approval gate is enforced server-side** — the brief's "safe owner handoff" is built into the Instagram chain. We must wire the Telegram approve flow.

### 5.3 Google Business — `gb_*` (5 tools)

| Tool | Required args | Notes |
|---|---|---|
| `gb_get_metrics` | `period` (`last_7_days` or `last_30_days`) | Views, calls, direction requests |
| `gb_list_reviews` | none | Recent reviews on the simulated GBP profile |
| `gb_list_simulated_actions` | none | Inspect everything we've recorded in the GMB sim namespace |
| `gb_simulate_post` | `content` (callToAction `{label,url}` and `photoUrl` optional) | Recorded community update post |
| `gb_simulate_reply` | `reviewId`, `reply` | Records proposed reply. **Evaluator scores BOTH existence and wording** of the reply |

Counters fed: `gbusinessReviews` (from `gb_list_reviews` returning items), `gbusinessReplies` (from `gb_simulate_reply`).

**Wording matters.** Per the description, the evaluator literally reads the reply text — keep it on-brand (HappyCake voice from `docs/brandbook.md`), no template clichés.

---

## 6. Evaluator — the literal scoring rubric

`evaluator_generate_team_report` returns a per-dimension breakdown (max 100 each, weighted into a final score). Four dimensions are visible so far:

| Dimension | Drives the score from | by doing |
|---|---|---|
| Marketing loop | leads generated, owner reports, attributed orders | actually call `marketing_create_campaign` end-to-end at least once |
| POS + kitchen handoff | orders created, tickets created, accepts, ready, completed | run the full chain Order → Ticket → Accept → Status `ready` → Status `completed` |
| Channel response | whatsapp inbound/outbound, IG actions, GBP reviews/replies | discover the channel tools, handle at least one event in each |
| World scenario execution | active scenario, events delivered, mcp_audit_log volume | start a public scenario, poll events, react to each |

`evaluator_get_evidence_summary` returns the running counts. **Treat each non-zero counter as a unit of evidence; treat each gap mentioned in the team report as a TODO.**

---

## 7. Newly discovered tools — to integrate

`tools/list` (research/mcp-tool-list.json) revealed **55 tools total**. Beyond what's documented above, these are high-leverage and previously unknown:

**Square POS extras**
- `square_get_inventory` — `{variationIds: string[]}` — sandbox inventory levels per variation
- `square_recent_orders` — recent orders feed (use for owner `/today` + repeat-customer detection)
- `square_recent_sales_csv` — CSV dump for analytics; pairs with `marketing_get_sales_history`

**Kitchen extras**
- `kitchen_get_capacity` — likely a thinner version of `kitchen_get_production_summary`; verify
- `kitchen_get_menu_constraints` — pull what kitchen will/won't accept (allergens, lead times) — use this on policies page instead of inventing rules
- `kitchen_list_tickets` — read-side counterpart to `kitchen_create_ticket`; the kitchen automator should poll this instead of keeping a local queue
- `kitchen_mark_ready` — **may be the proper "ready" transition** rather than `square_update_order_status(..., "ready")`. Test which one the evaluator credits

**Marketing extras (high-leverage)**
- `marketing_route_lead` — explicit lead routing call; this is what drives the `leadsRouted` counter. Required for full marketing-loop credit
- `marketing_adjust_campaign` — drives the `adjustments` counter (budget reallocation bonus)
- `marketing_get_campaign_metrics`, `marketing_get_budget` — read state for the owner report
- `marketing_get_margin_by_product` — **gold for `MARKETING_PLAN.md`** — replaces our TODO margin assumptions with real numbers
- `marketing_get_sales_history` — same, for revenue baseline

**World — the unblock for scenario score**
- `world_get_scenarios` — **lists valid scenarioIds** (the missing piece that made `world_start_scenario({scenarioId: "test"})` fail). Call this first, pick a public-practice id, then `world_start_scenario`
- `world_get_timeline` — read full scenario timeline upfront for planning
- `world_inject_event` — inject our own events (useful for smoke tests)

**Per-dimension evaluator scoring (instead of just the team report)**
- `evaluator_score_channel_response`, `evaluator_score_marketing_loop`, `evaluator_score_pos_kitchen_flow`, `evaluator_score_world_scenario` — call after each major workstream to see exactly that dimension's delta without churning the whole report

**Action items embedded in this discovery:**
1. Rebase the kitchen automator on `kitchen_list_tickets` + `kitchen_mark_ready`
2. Add `marketing_route_lead` and `marketing_adjust_campaign` to the marketing chain (for `leadsRouted` and `adjustments` counters)
3. Replace `world_start_scenario({scenarioId: "test"})` with `world_get_scenarios` → pick valid id → start
4. Use `marketing_get_margin_by_product` to fill `MARKETING_PLAN.md` real numbers

---

## 8. Adaptive layer — when schemas surprise us

The `_master_schema_dump.json` is a snapshot. Sandbox versions may shift mid-event. The wrapper should be defensive:

1. **Never hardcode slugs or product IDs** in code or copy. Always start from a fresh `square_list_catalog` call cached for ≤60 seconds.
2. **Parse error responses** for the `"X, Y, and Z are required"` pattern. If our payload missed a field, log it and retry once with a sensible default. This recovers gracefully from added required fields.
3. **Verify status enums** by calling `square_update_order_status` with a benign-looking value first; if it errors with an enum hint, capture the valid set.
4. **`mode: "simulated"`** in every response is the sandbox flag. If this ever becomes `mode: "production"`, refuse and escalate — the system was not built for real customers.

End of MCP schema reference.
