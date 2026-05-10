# Architecture

> One-line summary: **bot wrappers → `claude -p` headless → MCP sandbox + Telegram**. Production chat runs over an ngrok tunnel back to the operator's local agent so `claude -p` (which doesn't exist on Vercel serverless) is reachable from the live site.

## Pictures

### Channel webhook flow (WhatsApp / Instagram)

```
   Sandbox (or real WhatsApp / IG webhook in prod)
        │ POST /webhooks/whatsapp  {from, message}
        │ POST /webhooks/instagram {threadId, from, message}
        ▼
   bots/owner_bot.py Starlette route
        ▸ 200 OK in <100ms (sandbox / Meta won't time out)
        ▸ Spawn fresh OS thread + WindowsProactorEventLoopPolicy
          (PTB's loop and uvicorn's loop don't share state, and
           subprocess on Windows requires Proactor)
        ▼
   Background thread runs _process_channel_inbound:
        ▸ conversation_state.append_turn("customer", message)
        ▸ Always: Telegram alert with [Take over] [Let bot handle] buttons
        ▸ If thread mode == "bot":
            ▸ Spawn `claude -p /sales` with full transcript + cart
            ▸ whatsapp_send / instagram_send_dm with reply
            ▸ conversation_state.append_turn("agent", reply)
            ▸ Telegram trace: "🤖 Agent → thread X" with Hand-back button
        ▸ If thread mode == "live_owner":
            ▸ DO NOT auto-reply. Owner's next free-text Telegram
              message is routed to this thread.

   Owner tap [Take over]:
        ▸ conversation_state.set_mode("live_owner")
        ▸ Notify customer: "A team member is jumping in now…"
        ▸ Owner free-text → whatsapp_send / instagram_send_dm

   Owner tap [↩ Hand back to bot]:
        ▸ conversation_state.set_mode("bot")
        ▸ Notify customer: "The HappyCake assistant is back."
```

### Production end-to-end (today)

```
        ┌─────────────────────────────────────────────────┐
        │  Browser at https://happycake-us.vercel.app     │
        │     ▸ Next.js 14 SSR pages (catalog, product,   │
        │       cart, /c/[slug], /about, /policies, ...)  │
        │     ▸ React cart + chat providers (sessionStorage)│
        │     ▸ Floating "Talk to us" widget (queue model)  │
        └────────────────────────┬────────────────────────┘
                                 │
              POST /api/chat  /  POST /api/order  /  POST /api/escalation
                                 │
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │  Vercel serverless route (Node.js runtime)      │
        │     ▸ Detects LOCAL_AGENT_URL → proxy mode      │
        │     ▸ Adds ngrok-skip-browser-warning header    │
        │     ▸ Optional x-site-chat-token gate           │
        └────────────────────────┬────────────────────────┘
                                 │  HTTPS to LOCAL_AGENT_URL
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │  ngrok / Cloudflare Tunnel → operator's machine │
        └────────────────────────┬────────────────────────┘
                                 │  http://localhost:8000
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │  bots/owner_bot.py   (one process)              │
        │     ▸ Telegram polling (PTB v21, main loop)     │
        │     ▸ Starlette + uvicorn HTTP on :8000         │
        │       /healthz                                  │
        │       /site-chat   ← live chat from Vercel      │
        │       /escalations ← from /api/order, complaint │
        │     ▸ approval_queue (JSONL on disk)            │
        │     ▸ on /site-chat: spawn claude -p /sales     │
        │     ▸ on escalation: direct httpx → Telegram    │
        └────────────────────────┬────────────────────────┘
                                 │  subprocess
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │  Claude Code CLI  (Opus 4.7, headless mode)     │
        │     .claude/                                    │
        │       ├ mcp.json  → happycake MCP server        │
        │       ├ system-prompts/happycake-brand.md       │
        │       │           (15 hard rules, 5 scenarios,  │
        │       │            tone test, glossary, refs)   │
        │       └ commands/                               │
        │           ├ sales.md   customer-facing          │
        │           └ owner.md   operator-facing          │
        └────────────────────────┬────────────────────────┘
                                 │  MCP HTTPS POST (X-Team-Token)
                                 ▼
        ┌─────────────────────────────────────────────────┐
        │  MCP sandbox @ steppebusinessclub.com/api/mcp    │
        │  55 tools across 7 namespaces:                  │
        │   square_*, kitchen_*, marketing_*, world_*,    │
        │   whatsapp_*, instagram_*, gb_*, evaluator_*    │
        │  Per-team isolation by token; mcp_audit_log     │
        │  records every call.                            │
        └─────────────────────────────────────────────────┘
```

### Owner side (Telegram)

```
   Owner phone (@Alibi14, chat_id 373808588)
        │
        ▼
   Telegram → bot @happy_cake_step_bot
        │
        ▼
   bots/owner_bot.py PTB polling loop
   commands: /today /approvals /escalations /reviews /marketing
   inline buttons: ✓ Approve  ✎ Edit  ✗ Reject
        │
        ▼
   on Approve:
     review_reply           → gb_simulate_reply
     marketing_campaign     → marketing_create_campaign + launch + leads + route + report
     custom_order           → square_create_order + kitchen_create_ticket
     office_over_capacity   → owner manually fulfils, ack only
        │
        ▼
   approval_queue.jsonl persists state across restarts
```

### Kitchen automator (background worker)

```
   bots/kitchen_automator.py — every 5 seconds
        │
        ▼
   kitchen_list_tickets  + kitchen_get_production_summary
        │
        ▼
   for each queued ticket:
       if remainingCapacityMinutes ≥ ticket.estimatedPrepMinutes:
           kitchen_accept_ticket  +  square_update_order_status(in_kitchen)
       else:
           kitchen_reject_ticket  +  POST escalation to owner_bot
   for each accepted ticket:
       if estimatedReadyAt ≤ now:
           kitchen_mark_ready  +  square_update_order_status(ready)
   for each ready ticket older than 24h:
       square_update_order_status(completed)  ← safety net
```

## Agent decomposition

We chose **one logical agent, two slash-commands**, instead of multiple specialist agents. Reason: 24 hours, fewer integration seams, single brand voice enforced by one system prompt that's appended via `--append-system-prompt` on every invocation.

| Slash command | Purpose | System prompt | Available MCP tools |
|---|---|---|---|
| `/sales` | Customer reply across WhatsApp / IG / site chat | `happycake-brand.md` | `square_list_catalog`, `square_create_order`, `square_get_pos_summary`, `kitchen_get_production_summary`, `kitchen_create_ticket`, escalate-to-owner via JSON envelope `escalation` field |
| `/owner` | Operator reports + approvals + marketing loop | `happycake-brand.md` (with operator framing — "audience is the owner, not a customer") | All `marketing_*`, all `square_*`, all `kitchen_*`, `world_*`, `evaluator_*`, `gb_*` |

Routing happens inside `/sales` — the `channel` field in the envelope decides reply length and tone calibration. No separate agent per channel.

## Owner-bot mapping

| Telegram bot | Wraps | Agent command |
|---|---|---|
| `owner_bot` (one bot, `@happy_cake_step_bot` in dev) | `bots/owner_bot.py` | `/owner` |

Inline buttons drive approval/reject state in `bots/shared/approval_queue.py` (JSONL on disk → survives restart). Free-text messages from the owner are routed to `/owner ask <text>` via `bots/shared/claude_runner.py` which subprocesses `claude -p` with the brand prompt appended.

## MCP tool map by use case

| Use case | Tools |
|---|---|
| Read catalog | `square_list_catalog` |
| Create order | `square_create_order` (idempotent by `(phone, slug, pickup_at)` hash) |
| Update order status | `square_update_order_status` |
| POS snapshot | `square_get_pos_summary` |
| Inventory | `square_get_inventory` |
| Sales history | `square_recent_sales_csv`, `marketing_get_sales_history` |
| Kitchen capacity / today's bake | `kitchen_get_production_summary`, `kitchen_get_capacity` |
| Kitchen tickets | `kitchen_create_ticket`, `kitchen_list_tickets`, `kitchen_accept_ticket`, `kitchen_reject_ticket`, `kitchen_mark_ready` |
| Menu constraints | `kitchen_get_menu_constraints` |
| Marketing closed loop | `marketing_create_campaign` → `marketing_launch_simulated_campaign` → `marketing_generate_leads` → `marketing_route_lead` → `marketing_adjust_campaign` → `marketing_report_to_owner` |
| Margin / budget | `marketing_get_margin_by_product`, `marketing_get_budget`, `marketing_get_campaign_metrics` |
| World / scenarios | `world_get_scenarios` (list valid IDs), `world_start_scenario`, `world_next_event`, `world_advance_time`, `world_get_scenario_summary`, `world_get_timeline`, `world_inject_event` |
| WhatsApp | `whatsapp_register_webhook`, `whatsapp_inject_inbound`, `whatsapp_send`, `whatsapp_list_threads` |
| Instagram | `instagram_register_webhook`, `instagram_inject_dm`, `instagram_list_dm_threads`, `instagram_send_dm`, `instagram_reply_to_comment`, `instagram_schedule_post`, `instagram_approve_post`, `instagram_publish_post` |
| Google Business | `gb_get_metrics`, `gb_list_reviews`, `gb_list_simulated_actions`, `gb_simulate_post`, `gb_simulate_reply` |
| Evidence | `evaluator_get_evidence_summary`, `evaluator_score_*` (per-dimension), `evaluator_generate_team_report` |

55 tools total. Verified schemas in [docs/MCP_SCHEMAS.md](docs/MCP_SCHEMAS.md). Discovery raw dump in [research/mcp-tool-list.json](research/mcp-tool-list.json).

## Data flow — a single site-chat turn (production)

1. Customer types in the floating widget → `useChat().send(text)` → message added to React state + sessionStorage; queued for delivery.
2. Worker effect fires: `POST /api/chat` with envelope including transcript, latest_message, and `page_context.cart` (snapshot of `useCart().items`).
3. Vercel `/api/chat` route checks `LOCAL_AGENT_URL`. If set: forwards to `${LOCAL_AGENT_URL}/site-chat` with `ngrok-skip-browser-warning: true` + optional `x-site-chat-token`.
4. ngrok tunnels the request to `http://localhost:8000/site-chat` on the operator's machine.
5. `bots/owner_bot.py` /site-chat handler: validates token → calls `bots/shared/claude_runner.run_claude(command_name="sales", envelope=envelope)`.
6. `claude_runner` builds the prompt: brand system-prompt via `--append-system-prompt`, slash-command body inline, envelope as JSON. Spawns `claude -p` (Opus 4.7) with `--allowedTools "Read,mcp__happycake"`.
7. Claude executes `/sales`: classifies intent, calls MCP tools (catalog, capacity, etc.), drafts reply, runs the brand 10-point self-check, emits a JSON envelope.
8. owner_bot parses envelope. If `escalation` is set OR intent is `complaint`/`escalation_request` OR `handoff_request: true` was on the inbound: pushes a Telegram alert to the owner via direct httpx (with full transcript + cart + WhatsApp deep link if customer phone known + Approve/Edit/Reject buttons).
9. Returns the JSON envelope to Vercel → browser. `useChat()` appends agent reply to messages + sessionStorage.

Side-effects observable in `mcp_audit_log` (sandbox-side, drives evaluator scoring) and `logs/audit-YYYY-MM-DD.jsonl` (local, written by `.claude/hooks/log_mcp.sh` PostToolUse hook).

## Production handoff

The Next.js site is the production candidate for `happycake.us`. To go live after the hackathon:

1. **Replace MCP adapters** — `site/lib/mcp.ts` and `bots/shared/mcp_client.py` are the only files that talk to the sandbox. Switch their bodies to call Square / WhatsApp Cloud / Instagram Graph / Google Business Profile APIs. Keep function signatures identical.
2. **Drop the ngrok proxy** — `/api/chat` calls a hosted Anthropic-API endpoint (or a managed agent runtime) directly, returns the same envelope shape. Same `/sales` prompt + same `/owner` prompt; different transport.
3. **Real Telegram chat ID + bot** — keep the same bot pattern, just point it at the owner's actual Telegram (already true in dev — same approval queue model).
4. **Move env vars** from local `.env` to Vercel project settings + a server vault (1Password Connect, Doppler, Infisical).
5. **Add real authentication on `/api/order`** — signed customer phone token + rate limit (AbortSignal already in place; just add hashing).
6. **Sign webhook payloads** — verify Meta / Square HMAC signatures on inbound webhooks.

Repo stays public per hackathon terms; production secrets stay in Vercel + the vault.

### Adapter swap, env-var by env-var

| Capability | Sandbox (now) | Production (future) | New env vars |
|---|---|---|---|
| Catalog read | `mcp__happycake__square_list_catalog` | Square Catalog API | `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` |
| Order create / status | `mcp__happycake__square_create_order`, `square_update_order_status` | Square Orders API | same |
| POS snapshot | `mcp__happycake__square_get_pos_summary` | Square Reports API | same |
| Inventory live | `mcp__happycake__square_get_inventory` | Square Inventory API | same |
| Margin / sales history | `mcp__happycake__marketing_get_margin_by_product`, `marketing_get_sales_history` | Square sales CSV ingest + cost data | `SQUARE_REPORTS_LOCATION_ID` |
| Kitchen ticket / capacity | `mcp__happycake__kitchen_*` | Custom kitchen-display board (Square POS extension or partner KDS) | `KITCHEN_ENDPOINT`, `KITCHEN_API_KEY` |
| WhatsApp send | `mcp__happycake__whatsapp_send`, `whatsapp_list_threads` | WhatsApp Business Cloud API (Meta) | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` |
| WhatsApp inbound | sandbox `whatsapp_inject_inbound` + `world_next_event` | WhatsApp webhook + Meta verification | `META_APP_SECRET`, `META_VERIFY_TOKEN` |
| Instagram DMs / posts | `mcp__happycake__instagram_*` | Instagram Graph API | `IG_ACCESS_TOKEN`, `IG_USER_ID` |
| Google reviews / posts | `mcp__happycake__gb_list_reviews`, `gb_simulate_reply`, `gb_simulate_post`, `gb_get_metrics` | Google Business Profile API | `GBP_LOCATION_NAME`, `GBP_OAUTH_REFRESH_TOKEN` |
| Marketing campaigns | `mcp__happycake__marketing_*` (full chain: create / launch / generate_leads / route_lead / adjust_campaign / report_to_owner) | Meta Ads API + Google Ads API | `META_AD_ACCOUNT_ID`, `META_ADS_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_REFRESH_TOKEN` |
| World scenarios / events | sandbox-only | n/a in production (real customer events arrive via webhooks) | — |
| Evaluator | sandbox-only | n/a in production (replaced by ops dashboard / weekly report) | — |

A single env var (`HAPPYCAKE_MODE=sandbox|production`) toggles between adapters at startup. The agents and slash-commands need no edits — only the adapter module body changes per capability.

## Security hygiene

- **No secrets in repo.** `.env.example` only has placeholders. `bash scripts/audit.sh` greps for `sbc_team_*` patterns before every push.
- **Telegram chat-id check** on every owner_bot handler — only `TELEGRAM_OWNER_CHAT_ID` can drive commands; anything else is silently ignored.
- **`SITE_CHAT_TOKEN`** (optional) gates the public `/site-chat` ngrok endpoint so a discovered tunnel isn't an open Claude proxy.
- **`X-Team-Token`** scopes every MCP call to our team (audit log + state isolation).
- The on-site chat widget never receives MCP credentials directly — it talks to `/api/chat` which proxies to the bot which spawns `claude -p` server-side.
- **Permission deny rules** in `.claude/settings.json` prevent the agent from `Read(./.env)`, `Write(./.env)`, `Edit(./.env)`, or `curl` patterns matching `sbc_team_*` / `X-Team-Token`.

## Repo layout

```
happy/
├── README.md                  ← submission entry point
├── ARCHITECTURE.md            ← this file
├── BUSINESS_HYPOTHESIS.md     ← $500 → $5k math, real April baseline
├── MARKETING_PLAN.md          ← real margins, channel allocation, capacity throttle
├── CLAUDE.md                  ← project memory auto-loaded by claude
├── Makefile                   ← install / verify / dev / smoke / audit
├── .mcp.json                  ← project-scoped MCP server (token via ${VAR})
├── .env.example               ← placeholders only
├── .claude/
│   ├── settings.json          ← permissions + hooks + model
│   ├── settings.local.json    ← enabledMcpjsonServers (gitignored normally)
│   ├── system-prompts/
│   │   └ happycake-brand.md   ← 15 hard rules + voice + scenarios + reference posts
│   ├── commands/
│   │   ├ sales.md             ← /sales contract (envelope + JSON output)
│   │   └ owner.md             ← /owner contract
│   ├── hooks/
│   │   └ log_mcp.sh           ← PostToolUse → logs/audit-*.jsonl
│   └── scripts/
│       └ mcp_headers.sh       ← legacy fallback for header injection
├── site/                      ← Next.js 14 app, deployed to Vercel
│   ├── app/                   ← App Router pages + API routes
│   ├── components/            ← React components
│   ├── lib/
│   │   ├ mcp.ts               ← typed MCP client (TS)
│   │   ├ assets.ts            ← curated CDN paths
│   │   ├ cart.tsx             ← cart context + sessionStorage
│   │   └ chat.tsx             ← chat context + sessionStorage + queue
│   └── styles/tokens.css      ← brand tokens (RGB triplets for Tailwind)
├── bots/
│   ├── owner_bot.py           ← Telegram + /site-chat + /escalations HTTP
│   ├── kitchen_automator.py   ← deterministic background worker
│   ├── site_chat_server.py    ← standalone alt to running inside owner_bot
│   ├── shared/
│   │   ├ mcp_client.py        ← typed Python MCP client (sync)
│   │   ├ approval_queue.py    ← JSONL-backed queue
│   │   ├ claude_runner.py     ← claude -p subprocess wrapper
│   │   └ schemas.py           ← Pydantic models for MCP shapes
│   ├── wrappers/run_all.py    ← supervisor for `make dev`
│   └── requirements.txt
├── scripts/
│   ├── verify.sh              ← 7-step env health check
│   ├── deploy.sh              ← Vercel deploy with env push
│   ├── channel_smoke.sh       ← WhatsApp + IG + GB end-to-end
│   ├── kitchen_smoke.sh       ← order → ticket → ready → completed
│   ├── world_smoke.sh         ← public scenario end-to-end
│   ├── marketing_smoke.sh     ← full marketing chain
│   ├── channel_counter_probe.sh ← per-tool counter delta forensics
│   ├── audit.sh               ← brand + secret pre-push audit
│   ├── mobile_screenshots.mjs ← Playwright iPhone SE diagnostic
│   └── mobile_cart_smoke.mjs  ← e2e cart + chat persistence test
├── docs/
│   ├── MCP_SCHEMAS.md         ← verified tool schemas (source of truth)
│   ├── DISCOVERY_REPORT.md    ← Phase 0 findings
│   ├── SITE_SPEC.md           ← site build spec
│   ├── KITCHEN_AUTOMATION.md  ← order chain spec
│   ├── BONUS_OPPORTUNITIES.md ← +15 bonus rubric
│   ├── TELEGRAM_SETUP.md      ← bot + chat_id walkthrough
│   ├── SANDBOX.md             ← MCP usage notes
│   ├── on-site-assistant-test-script.md
│   ├── demo-script.md
│   └── research/              ← raw inputs (brief, brandbook, real biz info)
├── research/                  ← evidence trail (gitignored raw subdir)
└── logs/                      ← audit + bot + escalation logs (gitignored)
```
