# Discovery report — 2026-05-10

One-page snapshot from the Phase-0 discovery pass. Sources: live JSON-RPC `tools/list` against the happycake MCP (`research/mcp-tool-list.json`) and `evaluator_generate_team_report` (`research/baseline-score.json`).

## 1. MCP inventory — 55 tools across 7 namespaces

| Namespace | Count | Tools |
|---|---:|---|
| `square_*` | 7 | catalog, create_order, update_order_status, get_pos_summary, get_inventory, recent_orders, recent_sales_csv |
| `kitchen_*` | 7 | create_ticket, accept_ticket, reject_ticket, mark_ready, list_tickets, get_capacity, get_menu_constraints, get_production_summary |
| `marketing_*` | 10 | create_campaign, launch_simulated_campaign, generate_leads, route_lead, adjust_campaign, report_to_owner, get_budget, get_campaign_metrics, get_margin_by_product, get_sales_history |
| `world_*` | 7 | get_scenarios, start_scenario, next_event, advance_time, get_scenario_summary, get_timeline, inject_event |
| `whatsapp_*` | 4 | register_webhook, inject_inbound, send, list_threads |
| `instagram_*` | 8 | register_webhook, inject_dm, list_dm_threads, send_dm, reply_to_comment, schedule_post, approve_post, publish_post |
| `gb_*` (Google Business) | 5 | get_metrics, list_reviews, list_simulated_actions, simulate_post, simulate_reply |
| `evaluator_*` | 6 | generate_team_report, get_evidence_summary, score_channel_response, score_marketing_loop, score_pos_kitchen_flow, score_world_scenario |

## 2. Surprises vs. our prior assumptions

1. **Google Business tools are `gb_*`**, not `gbusiness_*` as we'd guessed. Counter names stay long (`gbusinessReviews`/`gbusinessReplies`) but tool names are short. All over CLAUDE.md/MCP_SCHEMAS.md the placeholder name was wrong.
2. **`world_get_scenarios` exists** — solves the "valid scenarioId is unknown" blocker from section 4 of MCP_SCHEMAS. We can self-discover the public-practice id; no need to wait on organisers.
3. **Per-dimension evaluator scoring** (`evaluator_score_channel_response`, etc.) lets us cheaply check just the dimension we just touched, instead of re-running the whole team report.
4. **Marketing has 10 tools, not 4.** Critical missed ones: `marketing_route_lead` (drives `leadsRouted`), `marketing_adjust_campaign` (drives `adjustments`), `marketing_get_margin_by_product` (real margin numbers for `MARKETING_PLAN.md`). Our existing plan to "create 1 campaign end-to-end" wouldn't have hit full marketing-loop credit because we were missing route + adjust.
5. **Kitchen has dedicated `kitchen_mark_ready`**, separate from `square_update_order_status(..., "ready")`. Need to test which one the evaluator credits — possibly both must fire.
6. **Instagram approval gate is server-enforced**: `instagram_publish_post` errors if the post wasn't approved via `instagram_approve_post` first. The "safe owner handoff" bonus is built into the API — all we need to do is wire the Telegram approve flow, no extra invariants needed.
7. **`headersHelper` workaround in `.mcp.json` was obsolete** — `${VAR}` interpolation works in current Claude Code 2.1.138 (issue #51581 evidently fixed). Replaced with standard `headers` field. (Already committed in this discovery pass.)

## 3. Baseline score — 51 / 100

| Dimension | Score | Top gap |
|---|---:|---|
| Marketing loop | **100** | Already maxed (6 leads + 3 owner reports from prior testing) |
| POS + kitchen handoff | **65** | No accept/reject/ready/completed evidence; only 1 ticket exists |
| Channel response | **0** | Zero events on all three channels — all 17 tools untouched |
| World scenario execution | **40** | No active scenario, 0 timeline events delivered |

Average = 51/100. **Bonus gate is at 80 core.** Channel response 0→100 alone is +25, World 40→100 is +15, POS 65→100 is +9. Closing channel + halving world scenario gap clears the gate.

Counters from `evaluator_get_evidence_summary`: 6 leads, 3 orders, 1 ticket, 88 audit calls. Marketing campaigns counter is 0 (the score is high purely from leads + reports — creating one full campaign cements it).

## 4. Top-5 work items (next 4 hours, in order)

1. **Channel response → +25 points (highest leverage).** Wire wrappers for `whatsapp_send`, `instagram_send_dm`, `gb_simulate_reply` driven by `claude -p /sales`. Smoke each by calling `whatsapp_inject_inbound` → wrapper handles → `whatsapp_send`. Ditto IG DM and one GBP review reply (on-brand wording matters per evaluator).
2. **Kitchen automator → +9 points.** Background worker rebased on `kitchen_list_tickets` + `kitchen_get_production_summary` + `kitchen_accept_ticket`/`kitchen_reject_ticket` + `kitchen_mark_ready` + `square_update_order_status(..., "completed")`. Closes the order chain end-to-end.
3. **World scenario run → +15 points.** Call `world_get_scenarios` → start a public-practice id → poll `world_next_event` for ~10 events → react via existing wrappers. This also bumps audit-call volume.
4. **Full marketing chain → cements 100/100.** `marketing_create_campaign` → `marketing_launch_simulated_campaign` → `marketing_generate_leads` → `marketing_route_lead` (per lead) → `marketing_adjust_campaign` (one budget reallocation) → `marketing_report_to_owner`. Hits all five sub-counters.
5. **Site scaffold + 5 product pages.** Next.js App Router with `/`, `/catalog`, `/product/[slug]` (5 SKUs), `/order/[slug]`, JSON-LD on each. Ground prices/availability via `square_list_catalog` + `kitchen_get_production_summary`. The site is scored separately as a deployable production candidate.

After core ≥80 (achievable from items 1+2+3+4 alone), then chase bonus per `docs/BONUS_OPPORTUNITIES.md`: WhatsApp follow-up, lead-value sort, README polish for production-readiness/business-pain evidence.

## 5. Environment fixes applied during discovery (already done)

- Installed `jq` via winget (`jqlang.jq` 1.8.1) — verify script depends on it.
- Replaced obsolete `headersHelper` in `.mcp.json` with standard `headers` + `${HAPPYCAKE_TEAM_TOKEN}` interpolation. `claude mcp list` now reports `happycake: ✓ Connected`.
- Added `.claude/settings.local.json` with `enabledMcpjsonServers: ["happycake"]` so the project MCP loads without interactive approval. Not committed (gitignored via standard pattern).
- `bash scripts/verify.sh` now prints **all 7 steps green**, including the PostToolUse audit hook writing to `logs/audit-2026-05-09.jsonl`.

The `mcp_headers.sh` helper is still present and still works (verify step 3 uses it for raw curl smoke), but it's no longer wired into `.mcp.json`. Safe to keep as a fallback.
