# HappyCake — AI sales & operations system

> **Live site:** https://happycake-us.vercel.app
> **Public repo:** https://github.com/ParkFl/happycake-hackathon
>
> A 24-hour hackathon build for **HappyCake** (Sugar Land, TX). Turns a placeholder website, a single WhatsApp line, an Instagram window-display, and a $500/month marketing budget into a closed, AI-operated sales loop — with the owner driving everything from Telegram. Site is live; chat works in production; orders flow through the real MCP sandbox; owner is alerted on Telegram for every approval.

---

## What you can do right now

| You can | Where | What happens |
|---|---|---|
| Browse the catalog | [happycake-us.vercel.app/catalog](https://happycake-us.vercel.app/catalog) | 5 SKUs, live prices from MCP, brandbook-formatted names, JSON-LD on every product |
| Add to cart, edit qty, place a multi-item order | `/cart` | One `square_create_order` with all items + per-item kitchen tickets |
| Order a custom cake | `/order/custom-birthday-cake` | **Routes to owner Telegram for approval first** — no order created until approved |
| Talk to the on-site assistant | floating "Talk to us" button on every page | `/sales` agent grounded in MCP catalog + capacity; conversation persists across page navigation; cart is visible to the agent |
| Hand off to a real person | "Hand off to team" button in the chat strip | Owner gets a Telegram alert with full transcript + WhatsApp deep link to reach you |
| Land on a marketing campaign | `/c/mothers-day-honey`, `/c/eid-honey`, 8 more | UTM-aware, JSON-LD `Offer`, threads `campaign_id` into the order metadata |
| Read the site as an AI agent | `/llms.txt`, `/api/catalog.json`, `/api/availability`, `/api/policies.json`, `/api/order` | See "How an AI customer can order in 4 calls" below |

---

## Quickstart (fresh clone)

> **Full step-by-step for judges with verification checkpoints:** [`docs/REPRODUCE.md`](docs/REPRODUCE.md). The TL;DR below assumes you've read it.

```bash
git clone https://github.com/ParkFl/happycake-hackathon.git
cd happycake-hackathon
cp .env.example .env
# Open .env. Fill the 4 REQUIRED vars (every other line has a default):
#   HAPPYCAKE_TEAM_TOKEN     — get from organizers' Discord (sbc_team_<32hex>)
#   TELEGRAM_BOT_TOKEN_OWNER — @BotFather → /newbot
#   TELEGRAM_OWNER_CHAT_ID   — @userinfobot → /start (numeric id)
#   NGROK_AUTHTOKEN          — dashboard.ngrok.com/get-started/your-authtoken
make install
bash scripts/verify.sh   # 7-step health check (claude CLI, .env, MCP reachable, hooks)
make dev                 # site on :3000, owner_bot on :8000 (Telegram + escalation HTTP)
```

In a separate terminal, expose port 8000 publicly so site chat + WhatsApp/IG webhooks reach the bot:

```bash
ngrok http 8000
# Copy the printed https URL.
# 1. Put it in .env as LOCAL_AGENT_URL=https://<id>.ngrok-free.app
# 2. Set the SAME URL on Vercel as LOCAL_AGENT_URL so production /api/chat proxies here.
bash scripts/deploy.sh    # one-shot: pushes HAPPYCAKE_TEAM_TOKEN + LOCAL_AGENT_URL to Vercel + deploys.
```

### Smoke the WhatsApp / Instagram webhooks (judges)

Once `ngrok http 8000` is running and you've copied the URL:

```bash
# WhatsApp inbound — owner gets a Telegram alert + agent reply via mcp_client.whatsapp_send
curl -X POST https://<your-ngrok-id>.ngrok-free.app/webhooks/whatsapp \
  -H 'Content-Type: application/json' \
  -d '{"from":"+18325559999","customer_name":"Maya","message":"Whole honey cake price please?"}'

# Instagram DM inbound — same flow via mcp_client.instagram_send_dm
curl -X POST https://<your-ngrok-id>.ngrok-free.app/webhooks/instagram \
  -H 'Content-Type: application/json' \
  -d '{"threadId":"th_001","from":"happy_customer_42","message":"Saw your honey cake on Insta"}'

# Site chat (proxied through Vercel; if no ngrok needed, hit the prod URL):
curl -X POST https://happycake-us.vercel.app/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"channel":"site_chat","session_id":"smoke-1","latest_message":"What is in stock today?","transcript":[]}'
```

Each call returns instantly with `{"ok":true,...}`; the agent runs in a background thread (~30-60s), then **owner gets a Telegram alert with 🙋 Take over button**. Tap it → owner's Telegram messages flow back to the customer with a `👤 Team` badge in the site chat / via `mcp_client.whatsapp_send`. See [`docs/REPRODUCE.md` §4-5](docs/REPRODUCE.md) for the full webhook contract.

---

## Demo (5 minutes)

`docs/demo-script.md` walks the canonical evaluator demo: site walkthrough → on-site assistant → WhatsApp inbound → owner Telegram → marketing loop → evidence trail.

Standalone smokes (each ~30–60s, real MCP traffic):

```bash
bash scripts/channel_smoke.sh    # whatsapp_inject_inbound + sales reply + IG DM + GB review reply
bash scripts/kitchen_smoke.sh    # full order → ticket → accept → ready → completed chain
bash scripts/world_smoke.sh      # start a public scenario, drive 6+ events, react via /sales
bash scripts/marketing_smoke.sh  # full marketing chain create → launch → leads → route → adjust → report
```

---

## Telegram bots — the owner's console

The operator has **one Telegram bot** that mirrors the entire business in their pocket. 11 slash-commands + persistent reply-keyboard:

| Command | What it does |
|---|---|
| `/today` | Live POS + kitchen snapshot (orders, revenue, tickets, capacity) |
| `/approvals` | Pending cards with emoji-headed summaries + Approve/Edit/Reject + 🙋 Take-over for site_chat threads |
| `/escalations` | Open complaints / over-capacity / handoffs filtered to the urgent ones |
| `/reviews` | Pulls Google reviews + drafts on-brand replies via claude → owner one-tap approves |
| `/marketing` | Running campaign totals; **`/marketing new <topic>`** drafts a full campaign (channel, audience, offer, CDN-image) for one-tap launch |
| `/live` | All currently-live owner-takeover threads + recent activity across WhatsApp, Instagram, site_chat |
| `/focus channel:id` | Pin reply focus to a specific thread |
| `/handback` | Hand the live chat back to the bot + auto-notify customer |
| `/cancel` | Drop pending Edit / Live state — unstick yourself |
| `/menu` `/help` | Show keyboard / command list |

When a customer presses **"Hand off to team"** in the site chat: agent asks for phone first (so contact survives a chat drop), then escalates → owner gets a rich Telegram card with last few turns, agent's reply, and a 🙋 Take-over button. One tap and the chat header on the customer's browser turns coral with **"👤 You're chatting with the team"**; every owner message back appears with a 👤 Team badge. `/handback` returns control to the bot with a polite "the assistant is back" notice. On Reject, the owner-bot auto-replies to the customer with alternatives + WhatsApp deep link — no silent drops.

Code: [`bots/owner_bot.py`](bots/owner_bot.py), [`bots/shared/conversation_state.py`](bots/shared/conversation_state.py), [`bots/shared/approval_queue.py`](bots/shared/approval_queue.py). Setup walkthrough: [`docs/TELEGRAM_SETUP.md`](docs/TELEGRAM_SETUP.md).

---

## Architecture (one paragraph)

A site that sells, a chat assistant that knows the kitchen, a cart that survives navigation, a $500 marketing loop that allocates and reports back, and a Telegram bot the owner uses to approve, reject, edit, and watch it all. **One Claude Code agent under the hood** with two slash-commands (`/sales` for customers, `/owner` for operator). Production site on Vercel proxies the chat API through ngrok to the operator's local `owner_bot` which spawns `claude -p` headless. All integrations through the hackathon MCP sandbox at `https://www.steppebusinessclub.com/api/mcp` with our `X-Team-Token`. No real Happy Cake credentials.

```
Browser → happycake-us.vercel.app/api/chat
        → fetch(LOCAL_AGENT_URL/site-chat) [+ ngrok-skip-browser-warning]
        → ngrok tunnel
        → owner_bot.py /site-chat (Starlette + uvicorn)
        → run_claude(/sales) [async subprocess, --append-system-prompt happycake-brand.md]
        → MCP sandbox tools (catalog, kitchen, escalation, ...)
        → JSON envelope back through tunnel → browser

If the agent escalates (complaint / handoff / out-of-scope):
        → owner_bot pushes a Telegram alert with transcript + WhatsApp deep link
        → owner taps Approve/Edit/Reject → MCP side-effect runs automatically
```

Full picture in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Telegram bot — `owner_bot`

One bot, runs locally as `bots/owner_bot.py` (Telegram polling + Starlette HTTP on :8000). Anything from a chat ID other than `TELEGRAM_OWNER_CHAT_ID` is silently ignored.

The bot publishes its command list via Telegram's `setMyCommands` on startup, so the owner sees a tap-able menu in any chat. There's also a persistent reply keyboard at the bottom (📊 Today · 📋 Approvals · 🛎 Escalations · ⭐ Reviews · 📈 Marketing · 🎯 Live chats · 🤖 Hand back · ❓ Help) — no need to type slashes.

| Command | What it does |
|---|---|
| `/start` · `/help` · `/menu` | Show command list + persistent keyboard |
| `/today` | POS + kitchen snapshot. Live `square_get_pos_summary` + `kitchen_get_production_summary` + count of pending approvals |
| `/approvals` | List pending items with inline `✓ Approve / ✎ Edit / ✗ Reject` buttons. Tap Approve and the MCP side-effect runs (review reply posted, marketing campaign launched + leads routed, custom order created + kitchen ticket queued) |
| `/escalations` | Open customer escalations — complaints, over-capacity office orders, custom-cake pending owner |
| `/reviews` | Pull `gb_list_reviews`, draft on-brand replies via `claude -p /owner`, queue with Approve/Edit/Reject. Approve → `gb_simulate_reply` |
| `/marketing` | Marketing report from `marketing_report_to_owner`. Free-text "let's run a Mother's Day push" → drafts a campaign, queues for approval. Approve → full chain (`create_campaign` → `launch_simulated_campaign` → `generate_leads` → `marketing_route_lead` per lead → `report_to_owner`) |
| `/live` | List active live conversations across channels (WhatsApp, Instagram, site chat). Shows mode (🤖 bot vs 🎯 owner-driven) and last message preview |
| `/focus channel:identifier` | Set focus on a thread, e.g. `/focus whatsapp:+18325551002`. Free text after that is routed to that customer |
| `/handback` | Hand the focused live thread back to the bot — customer is told "the assistant is back" |
| free text (no live focus) | Routed to `/owner ask <text>` via subprocess — operator can ask anything ("which channel performed best last 14 days?") and the agent replies with MCP-grounded data |
| free text (with live focus) | Sent verbatim to the focused customer via `whatsapp_send` / `instagram_send_dm` |

Inline button callbacks mutate state in `bots/shared/approval_queue.py` (JSONL on disk → survives bot restart). HTTP server endpoints below accept pings from the site, the sandbox webhook, and other wrappers.

**Daily marketing digest** is auto-scheduled (PTB job_queue) at 09:00 UTC: pulls `marketing_report_to_owner`, sends a Telegram summary to the owner.

### HTTP endpoints on `owner_bot`

| Endpoint | Purpose | Body |
|---|---|---|
| `GET /healthz` | Liveness probe | — |
| `POST /escalations` | Accept escalation from site `/api/escalation` (custom orders, complaints, office over-capacity) | `{kind, summary, ...}` |
| `POST /site-chat` | Production chat proxy from Vercel `/api/chat` | `{channel, transcript, latest_message, page_context}` |
| `POST /webhooks/whatsapp` | **Inbound WhatsApp** from sandbox webhook or manual injection | `{from: "+1...", message: "..."}` |
| `POST /webhooks/instagram` | **Inbound Instagram DM** from sandbox webhook | `{threadId, from, message}` |

Webhook contract: returns 200 OK in <100ms; the agent run + outbound channel send + Telegram alert all happen in a fresh background thread (with its own `WindowsProactorEventLoopPolicy` event loop so subprocess works on Windows). Sandbox simulator never times out the webhook.

### Live owner takeover — three trigger paths

The owner sees an alert in Telegram with `[🙋 Take over] [🤖 Let bot handle]` buttons (and `[📞 Open WhatsApp]` for WA threads) on **every** inbound across channels:

| Trigger | What customer sees | What owner gets |
|---|---|---|
| **Channel webhook** (`/webhooks/whatsapp` or `/webhooks/instagram`) — any inbound | If owner does nothing → bot replies on the channel via `/sales`. Owner taps Take over → customer gets *"A team member is jumping in now — give us just a moment."* | Telegram alert with the inbound message + Take-over button. After agent reply, a 🤖 trace shows what the bot said + Hand-back button |
| **Site chat** — `/sales` classifies intent="complaint" or "escalation_request", OR customer presses "Hand off to team" button | Brand-voice apology + "I've flagged this for the team — someone will jump in within minutes" + WhatsApp number | Telegram alert with last 4 turns, agent's just-sent reply, cart contents, page URL, customer phone (if known) as `wa.me` deep link, Approve/Edit/Reject buttons |
| **Order escalation** — custom cake or office over-capacity from `/api/order` | "Sent to the team for confirmation. We'll get back by phone within the hour." | Telegram alert with full order details, phone, message-on-top, pickup time, Approve/Reject. Approve → real `square_create_order` + `kitchen_create_ticket` runs |

**While the owner is "live" in a thread**, the bot does NOT auto-reply. Owner's free-text in Telegram is routed via `whatsapp_send` / `instagram_send_dm` to the customer. `bots/shared/conversation_state.py` tracks per-thread mode (`bot` | `live_owner`) and persists to `logs/conversations.jsonl` so a bot restart doesn't lose state.

When the owner taps `↩ Hand back to bot` (or types `/handback`), the customer is notified ("Thanks for your patience — the HappyCake assistant is back.") and bot mode resumes.

### Live catalog + inventory on the site

The product page badge is computed at request time from THREE live MCP reads:
- `square_list_catalog` (item, category)
- `kitchen_get_production_summary` (capacity)
- `square_get_inventory` (per-variation stock count)

Result hierarchy (most-restrictive wins): `Sold out today` → `24h lead · N slots left` → `Only N left today` (≤3) → `Slots filling — pre-order` → `Ready today · N in stock`. Implementation: [site/components/AvailabilityBadge.tsx](site/components/AvailabilityBadge.tsx).

---

## How an AI customer can order in 4 calls

The site is built for AI customers as a first-class user. From a clean fetch:

1. `GET /llms.txt` — server-rendered index of machine-readable resources, brand summary, ordering-flow recipe. Generated dynamically from the live MCP catalog ([site/app/llms.txt/route.ts](site/app/llms.txt/route.ts)) so cake names + prices stay in sync.
2. `GET /api/catalog.json` — every cake: `{ slug, name, category, price_usd, price_cents, description, requires_owner_approval, lead_time_hours, url, order_url }`.
3. `GET /api/availability?slug=whole-honey-cake` — live capacity from `kitchen_get_production_summary`. Returns `ready_today | lead_24h | sold_out`.
4. `POST /api/order` — multi-item: `{ items:[{variationId,quantity}], customer:{name,phone}, pickupAt }`. Single-item: `{ flow, slug, variationId, quantity, customer, ... }`. Custom-category items gate through owner approval queue → return `{ status: "pending_owner_approval", … }`.

Every product page also ships JSON-LD `Product` + `Offer` + `BreadcrumbList` schemas in the **initial server-rendered HTML** (not after JS hydration), so a non-executing crawler still sees the offer with the right price, image, and availability.

### Four conversion flows (per the brief)

| Flow | Trigger | Distinguishing logic |
|---|---|---|
| Birthday (default) | Any non-custom slug, qty&nbsp;<&nbsp;3 | Optional message-on-top text |
| Office | `office-dessert-box` slug or qty&nbsp;≥&nbsp;3 | Headcount, delivery vs pickup, billing preference; over-capacity routes to owner |
| Gift | "Send as a gift" toggle | Recipient name/address, hidden price, gift note |
| Custom | `custom-birthday-cake` slug | **No `square_create_order` until owner approves** — escalation routed to Telegram |

### Cart + chat (added in P1 fixes)

- React Context (`site/lib/cart.tsx`, `site/lib/chat.tsx`) + `sessionStorage` so cart and chat history survive page navigation
- Cart icon in header with badge count
- Multi-item checkout at `/cart` with inline qty stepper + remove + customer details + pickup time → `POST /api/order` with `items[]` → `/confirmation/[orderId]` page with full summary
- Chat widget sees `cart` in `page_context` envelope and answers "what's in my cart?" with real items + total (verified live)
- Send-while-thinking via a serial queue in the provider — keep typing without waiting for the previous reply

---

## Score & evidence (`evaluator_generate_team_report`)

| Dimension | Score | Evidence |
|---|---:|---|
| Marketing loop | **100/100** | 6 generated leads + 3 owner reports + 3 attributed orders ([research/baseline-score.json](research/baseline-score.json)) |
| POS + kitchen handoff | **100/100** | Order → ticket → accept → ready → completed chain + capacity-aware reject ([research/kitchen-smoke-after.json](research/kitchen-smoke-after.json), [scripts/kitchen_smoke.sh](scripts/kitchen_smoke.sh)) |
| World scenario execution | **100/100** | `launch-day-revenue-engine` started, 6 events processed, 5 reactions ([research/world-final-state.json](research/world-final-state.json), [scripts/world_smoke.sh](scripts/world_smoke.sh)) |
| Channel response | **20/100** | 2 WhatsApp inbound credited; outbound counters did not increment (sandbox bug, see below) |
| **Total** | **80/100** | Bonus gate of 80 cleared. 200+ MCP calls in `logs/audit-2026-05-09.jsonl` |

### Sandbox channel-counter aggregation bug (reproduced, evidenced)

The evaluator's outbound-channel counters — `whatsappOutbound`, `instagramActions`, `gbusinessReviews`, `gbusinessReplies` — do **not** increment from any successful tool call we can make. We proved this systematically with a per-tool probe ([scripts/channel_counter_probe.sh](scripts/channel_counter_probe.sh) → [research/channel-bug-evidence.json](research/channel-bug-evidence.json)): for each tool we snapshot evidence counters, call the tool with minimal valid args, snapshot again, and record the delta. Of 16 channel probes, **only `whatsapp_inject_inbound` moved a counter** (whatsappInbound went 1 → 2). All outbound/reply/post tools returned success, but `evaluator_get_evidence_summary` showed zero delta.

Crucially, the underlying data **is** persisted server-side — only the aggregated counter is broken:

| MCP read endpoint | What it shows after our calls | Counter value |
|---|---|---|
| `whatsapp_list_threads.outbound` | empty `[]` (whatsapp_send returns success but doesn't land in the thread feed either) | `whatsappOutbound: 0` |
| `instagram_list_dm_threads.outbound` | **5 outbound DMs recorded** | `instagramActions: 0` |
| `gb_list_simulated_actions.replies` | **9 review replies recorded** (rev_001/002/003/004, on-brand) | `gbusinessReplies: 0` |
| `gb_list_simulated_actions.posts` | 1 post recorded | (no counter exists) |
| `gb_list_reviews` | 4 reviews available (rev_001–rev_004) | `gbusinessReviews: 0` |

Reproduces with direct `curl`, ruling out our agent loop. Reproduces across multiple inputs (different phone numbers, different scenario customers, different review IDs, the full IG `schedule → approve → publish` chain). On-brand reply text is in [logs/audit-2026-05-09.jsonl](logs/audit-2026-05-09.jsonl) — not stubs. We surface this honestly rather than re-run the same calls hoping for a different result.

### Evidence trail

```bash
# Every MCP call ever made by this team during the build, structured JSONL:
cat logs/audit-2026-05-09.jsonl | jq

# Tool-by-tool count to date:
cat logs/audit-2026-05-09.jsonl | jq -r .tool | sort | uniq -c | sort -rn

# Just the customer-facing replies (claude -p envelopes):
grep '"intent"' logs/owner_bot.log | tail -20
```

`logs/audit-*.jsonl` is written by the PostToolUse hook ([.claude/hooks/log_mcp.sh](.claude/hooks/log_mcp.sh)). `research/*.json` has per-phase before/after snapshots of evaluator scores + counters. [docs/DISCOVERY_REPORT.md](docs/DISCOVERY_REPORT.md) covers Phase-0 findings (55 MCP tools, channel namespace correction, etc.). [docs/MCP_SCHEMAS.md](docs/MCP_SCHEMAS.md) has verified schemas with examples.

---

## Production smoke (mobile + desktop)

After deploy, all 17 routes responded HTTP 200 from [happycake-us.vercel.app](https://happycake-us.vercel.app):

| Group | Routes | Notes |
|---|---|---|
| Pages | `/`, `/catalog`, `/about`, `/policies`, `/cart`, `/confirmation/[orderId]`, `/order/[slug]` | Mostly SSG, `/order` and `/cart` dynamic |
| Product pages | `/product/{whole-honey-cake,honey-cake-slice,pistachio-roll,custom-birthday-cake,office-dessert-box}` | SSG with full Product+Offer+Breadcrumb JSON-LD per page |
| Campaign landings | `/c/{mothers-day-honey,office-friday,weekend-pistachio,valentines-honey,nauryz-honey,eid-honey,fathers-day-honey,thanksgiving-office,christmas-honey,back-to-school-office}` | 10 UTM-aware landings |
| Agent endpoints | `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/api/catalog.json`, `/api/availability`, `/api/policies.json`, `/api/order`, `/api/order/[id]`, `/api/escalation`, `/api/chat` | All return JSON or text/markdown; `/llms.txt` regenerated from live catalog on every request |

### Lighthouse mobile (iPhone SE 375px viewport, devtools throttling)

| Metric | Score | Target | Status |
|---|---:|---:|:---:|
| Performance | **90** | ≥85 | ✓ |
| Accessibility | **100** | ≥90 | ✓ |
| SEO | **100** | — | ✓ |
| Best Practices | **100** | — | ✓ |
| LCP | 2.85s | <2.5s | close |
| FCP | 2.39s | — | ✓ |
| CLS | 0 | <0.1 | ✓ |
| TBT | 164ms | — | ✓ |

Reports archived: [research/lighthouse/home.report.html](research/lighthouse/home.report.html) (before P0/P1 fixes), [research/lighthouse/home-v2.report.html](research/lighthouse/home-v2.report.html) (current).

### Brand sanity check (production HTML)

- `HappyCake` (one-word wordmark per brandbook) appears 14× on a typical product page
- `cake "Honey"` (correct format) appears 2× per product page (in headings + JSON-LD)
- **Zero** instances of `Happy Cake` (with space) in customer-facing pages — verified by `bash scripts/audit.sh`
- **Zero** instances of the owner's name in customer-facing copy — replaced everywhere with "the team" / "our team" / "the HappyCake team"
- All links to `/c/[slug]` carry the right UTM passthrough into `square_create_order` metadata

JSON-LD on product page: `BakeryBreadShop` (from layout) + `Product` + `Offer` + `BreadcrumbList` + `Organization` + `OpeningHoursSpecification` ×2 + `GeoCoordinates` + `PostalAddress` + `ListItem` ×3 = **9 distinct schema types** server-rendered.

---

## Real-adapter readiness (post-hackathon production handoff)

Every external integration goes through one module ([site/lib/mcp.ts](site/lib/mcp.ts) for site, [bots/shared/mcp_client.py](bots/shared/mcp_client.py) for bots). Function signatures intentionally mirror real-API shapes so the swap is mechanical.

| Capability | Sandbox (today) | Production (post-hackathon) | New env vars to add |
|---|---|---|---|
| Catalog read | `square_list_catalog` | Square Catalog API | `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` |
| Order create / status | `square_create_order`, `square_update_order_status` | Square Orders API | same as above |
| POS snapshot | `square_get_pos_summary` | Square Reports API | same |
| Inventory (live stock) | `square_get_inventory` | Square Inventory API | same |
| Margin + sales history | `marketing_get_margin_by_product`, `marketing_get_sales_history` | Square sales CSV ingest + cost data | `SQUARE_REPORTS_LOCATION_ID` |
| Kitchen ticket / capacity | `kitchen_*` | Custom kitchen-display board (Square POS extension or partner KDS) | `KITCHEN_ENDPOINT`, `KITCHEN_API_KEY` |
| WhatsApp send | `whatsapp_send`, `whatsapp_list_threads` | WhatsApp Business Cloud API (Meta) | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` |
| WhatsApp inbound | sandbox `whatsapp_inject_inbound` + `world_next_event` | WhatsApp webhook + Meta verification | `META_APP_SECRET`, `META_VERIFY_TOKEN` |
| Instagram DMs / posts | `instagram_*` | Instagram Graph API | `IG_ACCESS_TOKEN`, `IG_USER_ID` |
| Google reviews / posts | `gb_list_reviews`, `gb_simulate_reply`, `gb_simulate_post` | Google Business Profile API | `GBP_LOCATION_NAME`, `GBP_OAUTH_REFRESH_TOKEN` |
| Marketing campaigns | `marketing_create_campaign`, `marketing_launch_simulated_campaign`, `marketing_generate_leads`, `marketing_route_lead`, `marketing_adjust_campaign` | Meta Ads API + Google Ads API | `META_AD_ACCOUNT_ID`, `META_ADS_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_REFRESH_TOKEN` |

A single env var (`HAPPYCAKE_MODE=sandbox|production`) toggles between adapters at startup. The agents and slash-commands need no edits — only the adapter module body changes per capability. The Telegram bot, the kitchen automator, the cart, the chat widget, the brand prompt — everything else carries over unchanged.

The chat-in-production architecture (Vercel proxy → ngrok → local `claude -p`) is a hackathon pragma. In production, `/api/chat` would call a hosted Anthropic-API endpoint directly (still Claude Opus 4.7) and skip the tunnel. Same agent code, different transport.

---

## Business hypothesis ($500 → $5,000)

Full plan with real numbers from `marketing_get_margin_by_product` and `marketing_get_sales_history` in [MARKETING_PLAN.md](MARKETING_PLAN.md). Headline:

| | Value | Source |
|---|---:|---|
| April 2026 baseline revenue | $18,320 | `marketing_get_sales_history` |
| April 2026 orders | 724 | same |
| Avg ticket (6-month avg) | $25.30 | same |
| Blended gross margin | ~62% | `marketing_get_margin_by_product` weighted by mix |
| Daily kitchen capacity ceiling | ~16 whole cakes / day | `kitchen_get_production_summary` |
| Month-1 marketing-attributed revenue from $500 spend | ~$1,560 (3.1× same-cycle ROAS) | per-channel breakdown in MARKETING_PLAN |
| Trailing-90-day revenue from same $500 | ~$5,000 (10× ROAS) | repeat (30%) + reviews (15%) + cross-channel halo |
| Total month-1 system lift over baseline | ~$7,060 (+41%) | per-stream breakdown in BUSINESS_HYPOTHESIS |

Detailed model (with assumptions and failure modes) in [BUSINESS_HYPOTHESIS.md](BUSINESS_HYPOTHESIS.md).

---

## Submission checklist

- [x] Public Git repo (push pending — see "Final steps" below)
- [x] README with fresh-clone setup + score breakdown + sandbox-quirk disclosure + Telegram bot inventory + AI-customer instructions + production smoke + Lighthouse + real-adapter readiness
- [x] [ARCHITECTURE.md](ARCHITECTURE.md) — agents, routing, MCP map, owner-bot mapping, production proxy chain
- [x] [.env.example](.env.example) — placeholders only
- [x] Site **deployed**: [happycake-us.vercel.app](https://happycake-us.vercel.app) — Next.js 14 SSR, 4 conversion flows + cart, JSON-LD on every product, dynamic `/llms.txt`, `sitemap.xml`, `robots.txt`. 17 production endpoints verified 200. Re-deploy: `bash scripts/deploy.sh`.
- [x] Telegram bot live: `@happy_cake_step_bot` (commands listed above), Live escalation alerts verified for complaint / handoff / custom order
- [x] On-site assistant test script — [docs/on-site-assistant-test-script.md](docs/on-site-assistant-test-script.md)
- [x] Demo script — [docs/demo-script.md](docs/demo-script.md)
- [x] Smoke evidence in `research/`: channel-smoke / kitchen-smoke / world-smoke / channel-counter-probe / mobile-cart-smoke / lighthouse / mobile-issues-before+after
- [x] Marketing plan with real margins + real sales history — [MARKETING_PLAN.md](MARKETING_PLAN.md)
- [x] Business hypothesis with real April baseline — [BUSINESS_HYPOTHESIS.md](BUSINESS_HYPOTHESIS.md)
- [x] No secrets in tracked files — `bash scripts/audit.sh` passes green

## License & IP

Per hackathon participation agreement, IP of the deliverable is assigned to Steppe Business Club with a portfolio licence to the team. Repo is public after the event.
