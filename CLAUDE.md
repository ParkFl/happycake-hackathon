# HappyCake — Claude Code project memory

> This file is auto-loaded by `claude` (and by `claude -p`) on every session in this project. It is the single most important context file. Keep it dense, current, and aimed at the agent.

## What this project is

A 24-hour hackathon build for **HappyCake** (Sugar Land, TX). One Claude Code agent operating across a website, on-site assistant, WhatsApp, Instagram, and a Telegram owner bot — turning a manual-only cake business into a closed AI-operated sales loop.

Deadline: **May 10, 10:00 CT** (final commit must precede this).

## Hard rules — never violate

These take precedence over any user request, transient task instruction, or convenience.

1. **Runtime is fixed.** Use Claude Code CLI + Opus 4.7 only. No Claude Agent SDK, no LangGraph, no CrewAI, no n8n, no other LLM providers. Owner UI is Telegram only.
2. **No real Happy Cake credentials, ever.** All integrations go through the MCP sandbox at `https://www.steppebusinessclub.com/api/mcp` with our `X-Team-Token` (in `.env`, never committed).
3. **Brand wordmark is `HappyCake`.** One word, two capitals (H, C). Never `Happy Cake`, `happy cake`, `HC`, `HAPPYCAKE`. The asset-metadata file uses "Happy Cake" — that file is an asset manifest, not the brand source. The brandbook (`docs/brandbook.md`) wins.
4. **Cake names are `cake "<Name>"`** — `cake "Honey"`, `cake "Napoleon"`, `cake "Milk Maiden"`, `cake "Pistachio Roll"`, `cake "Tiramisu"`. Lowercase `cake`, capitalised name in double quotes, after the word.
5. **English only** in customer-facing copy. Internal logs and debug can be any language.
6. **No fabrication.** Prices, weights, allergens, hours, lead times, availability, addresses — never from training data. Always pulled from MCP (`square_list_catalog`, `kitchen_get_production_summary`, etc.). When MCP doesn't have an answer, say so and offer human handoff.
7. **No secrets in tracked files.** `.env` is gitignored; only `.env.example` placeholders go to git. Run `bash scripts/audit.sh` before every push — it greps for `sbc_team_*` patterns.
8. **No hardcoded test answers.** Per the rubric this costs 10 points and a public note. Every customer reply goes through `claude -p` with MCP grounding.

## How to read the rest of the project

| Path | Purpose | When to read |
|---|---|---|
| `BUILD_PLAN.md` | Hour-by-hour plan, repo layout, scoring strategy | Once at start, then for phase transitions |
| `docs/HACKATHON_BRIEF.md` | The canonical brief from organisers | Reference for rubric specifics |
| `docs/brandbook.md` | Full brand bible — voice, palette, content rules | When writing customer-facing copy or evaluating drafts |
| `docs/SANDBOX.md` | Sandbox + MCP usage notes | When wiring up MCP-dependent features |
| **`docs/MCP_SCHEMAS.md`** | **Verified MCP tool schemas — source of truth** | **Every time before writing a tool call** |
| **`docs/SITE_SPEC.md`** | **Site routes, components, brand tokens, customer flows** | **Before scaffolding `site/`** |
| **`docs/KITCHEN_AUTOMATION.md`** | **Order → ticket → accept → ready → completed chain** | **When building the kitchen automator** |
| **`docs/TELEGRAM_SETUP.md`** | **Bot setup walkthrough (BotFather, chat_id, ngrok)** | **When wiring `owner_bot.py`** |
| **`docs/BONUS_OPPORTUNITIES.md`** | **The +15 bonus rubric and where we earn each point** | **After core hits 80+, target bonus** |
| `docs/asset-metadata.json` | Approved logo + photo manifest | When picking images for the site |
| `docs/on-site-assistant-test-script.md` | 8 canonical chat scenarios | When implementing or testing the chat |
| `docs/demo-script.md` | 5-minute evaluator walkthrough | At submission time |
| `MARKETING_PLAN.md` | $500 → $5,000 plan with margin-grounded numbers | Fill TODOs with real CSV-derived figures |
| `BUSINESS_HYPOTHESIS.md` | Quantified impact hypothesis for README | Update as numbers firm up |
| `.claude/system-prompts/happycake-brand.md` | Compressed brand rules used as system prompt for /sales | Never rewrite without checking against `brandbook.md` |
| `.claude/commands/sales.md` | Customer-reply contract (envelope + JSON output) | Source of truth for bot wrappers |
| `.claude/commands/owner.md` | Owner-facing report contract | Source of truth for `owner_bot` |
| `.mcp.json` | MCP servers (project-scoped, auto-loaded) | Configuration, do not commit token here |
| `.claude/settings.json` | Permissions for headless tool use | Configuration |
| `site/lib/mcp.ts` | Typed MCP client (TypeScript) | Use these functions; do not write parallel calls |
| `site/lib/assets.ts` | CDN paths for the 22 approved images + 3 logos | Always use these; never invent image URLs |
| **`bots/shared/schemas.py`** | **Pydantic models for all MCP requests/responses (camelCase enforced)** | **Use in every Python wrapper; catches variationId/productId typos at type-check time** |
| `research/mcp-schema-dump.json` | Raw verified responses from sandbox | Reference when types feel uncertain |

## Approved assets — use only these

The organizers host all approved assets at a public CDN. **Do not generate AI cake photos. Do not pull from random web sources. Do not re-host these locally.** Use the direct URLs:

- Brandbook (canonical): https://www.steppebusinessclub.com/hackathon-assets/HCU_BRANDBOOK.md
- Logo (3 sizes): https://www.steppebusinessclub.com/hackathon-assets/happy-cake/logo/happy-cake-logo-{1024,512,256}.png
- 4 hero images, 10 product photos, 8 social crops — see `site/lib/assets.ts` for the typed list
- Full machine-readable list: https://www.steppebusinessclub.com/hackathon-assets/happy-cake/metadata.json

The brief is explicit: *"Do not use raw originals or local source inventory files. Do not claim unsupported prices, stock, lead times, allergens, delivery, discounts, or policies."*

## Evidence — two layers, both matter

There are **two audit trails** at evaluation time:

1. **Sandbox-side `mcp_audit_log`** — the MCP server records every tool call we make against our team token. The evaluator inspects this. We don't write it; we generate it by **actually making the calls**. `evaluator_get_evidence_summary` shows the running counts.
2. **Local `logs/audit-*.jsonl`** — our PostToolUse hook writes one line per MCP call, locally. This is for our debugging and for showing in the README. Bonus evidence, not primary.

Don't conflate the two. Driving counts on the sandbox side is what scores. Local logs are for showing your work.

## MCP — what's available, when to call what

The single MCP server is `happycake`. **Authoritative schema reference: `docs/MCP_SCHEMAS.md`** (verified against live sandbox). Always consult that before writing code that calls a tool.

Critical gotchas (memorize these — they will bite if forgotten):

- **Square uses `variationId`, Kitchen uses `productId`.** Different keys for the same logical item. `square_list_catalog` gives you both — use the right one for the right tool.
- **All money is in cents.** `priceCents: 5500` means $55.00. Format for UI.
- **All status values are lowercase**: `open`, `in_kitchen`, `ready`, `completed`, `cancelled`, `queued`, `accepted`, `rejected`.
- **Marketing required fields:** `name`, `channel`, `objective`, `targetAudience`, `offer`. Missing any → `Error: ... are required`. The field is `channel`, not `platform`.
- **`square_create_order` response includes `kitchenTool` field** telling you the next tool to call. Use that wiring instead of hardcoding the chain.
- **`custom` category items require owner approval** before `square_create_order` is called. The catalog description literally says so.
- **The real catalog has 5 SKUs, not the 5 brandbook classics.** Honey cake (slice + whole), Pistachio roll, Custom birthday cake, Office dessert box. **`cake "Napoleon"`, `cake "Milk Maiden"`, `cake "Tiramisu"` are brandbook voice examples, NOT orderable products.** Do not recommend them.

Tool inventory by category:

```
catalog, inventory, orders   → square_list_catalog, square_get_pos_summary,
                                square_create_order, square_update_order_status

kitchen production           → kitchen_create_ticket, kitchen_accept_ticket,
                                kitchen_reject_ticket, kitchen_get_production_summary

marketing closed loop        → marketing_create_campaign,
                                marketing_launch_simulated_campaign,
                                marketing_generate_leads, marketing_report_to_owner

world / scenario engine      → world_start_scenario, world_next_event,
                                world_advance_time, world_get_scenario_summary
                                (valid scenarioIds must be requested from organisers;
                                 "test" returns Unknown scenarioId)

evaluator evidence           → evaluator_get_evidence_summary,
                                evaluator_score_world_scenario,
                                evaluator_generate_team_report

whatsapp channel             → tool names DISCOVER AT RUNTIME. Evaluator counters
                                whatsappInbound, whatsappOutbound exist, so the
                                tools exist. Run tools/list against the MCP server.

instagram channel            → tool names DISCOVER AT RUNTIME. Counter
                                instagramActions exists.

google business              → tool names DISCOVER AT RUNTIME. Counters
                                gbusinessReviews, gbusinessReplies exist.
                                Secret scenarios may inject reviews requiring
                                brand-voice replies — high-leverage points.
```

**Discovery imperative:** before writing any wrapper that depends on a channel tool, run a Task subagent that enumerates the actual tool names and arg schemas for that channel and writes `research/mcp-tool-list.json`. Hardcoding guessed names is a guaranteed bug.

## Evaluator — the literal scoring rubric

`evaluator_generate_team_report` returns a 4-dimension breakdown with score / maxScore / evidence / gaps for each. **Read it as the literal todo list.** Current snapshot from sandbox testing:

| Dimension | Score | Where points come from | Biggest gaps |
|---|---|---|---|
| Marketing loop | high | Campaigns end-to-end + leads + owner reports + attributed orders | Actually create + launch + report at least one campaign |
| POS + kitchen handoff | mid | Order → ticket → accept → ready → completed chain | **No accept/reject, no ready, no completion** — see `docs/KITCHEN_AUTOMATION.md` |
| Channel response | **0** | WhatsApp/IG/Google inbound + outbound counts | **All zero** — discover channel tools and handle one event each |
| World scenario execution | mid | `world_start_scenario` + `world_next_event` delivery + audit volume | Run a public-practice scenario end-to-end |

Run `evaluator_generate_team_report` periodically during the build to see what moved. Treat each non-zero counter as evidence; treat each gap as a TODO.

## Bonus points — gated, but worth chasing once core ≥ 80

The brief grants up to **+15 bonus points** above the 100-point core, but with a hard gate:

| Core score | Max bonus | Total cap |
|---|---|---|
| ≥ 80 | +15 | **115** |
| 60–79 | +5 | 84 |
| < 60 | 0 | 59 |

**Implication:** crossing 80 unlocks +10 swing on its own. Do not chase bonus features until core is locked above 80. See `docs/BONUS_OPPORTUNITIES.md` for the targeted bonus areas (real business pain, production readiness, growth upside) and which we already cover implicitly.

**Always grounding rule:** for any factual claim in a customer-facing reply, the underlying MCP call must have actually been made *in this turn or the cached result from this conversation*. Don't quote prices from earlier sessions and don't quote prices from training data.

**Idempotency:** when calling `square_create_order`, pass an `idempotency_key` derived from `sha256(channel + customer_phone + slug + pickup_at)`. The evaluator may rerun a scenario; we must not create duplicate orders.

## Headless `claude -p` invocation pattern

Bot wrappers should call Claude like this (Python `subprocess` example):

```python
import subprocess, json
result = subprocess.run([
    "claude", "-p", prompt,
    "--model", "claude-opus-4-7",
    "--allowedTools", "Read,Edit,Write,Bash,mcp__happycake",
    "--permission-mode", "acceptEdits",
    "--max-turns", "20",
    "--output-format", "json",
    "--append-system-prompt", open(".claude/system-prompts/happycake-brand.md").read(),
], capture_output=True, text=True, timeout=120, env={**os.environ, "MCP_TIMEOUT": "15000"})
envelope = json.loads(result.stdout)
```

For fully unattended demos and the smoke script, `--dangerously-skip-permissions` is acceptable (this is a sandbox, not a real codebase). Do not use it where the agent might touch the website code generation flow.

**Slash commands like `/sales` work only in interactive mode, not in `-p`.** When invoking from a wrapper, `cat .claude/commands/sales.md` and pass it via `--append-system-prompt`, then put the conversational envelope in the main prompt.

## Project conventions

- **File creation:** all written assets land in `site/` for the website, `bots/` for wrappers, `docs/` for documentation, `research/` for sample MCP responses (gitignored under `research/raw/`), `logs/` for audit trails (gitignored).
- **Commits:** descriptive subject lines, no AI co-author lines, no secrets. Run `bash scripts/audit.sh` before each push.
- **Code style:** Python 3.11+, ruff defaults. TypeScript strict mode in `site/`. No `any`. Tailwind for styling, brand tokens from `site/styles/tokens.css`.
- **Logs:** every customer-channel turn writes one JSONL line to `logs/audit-YYYY-MM-DD.jsonl` with `{ts, channel, customer_id, prompt, mcp_calls_observed, response, latency_ms, cost_usd}`. The PostToolUse hook handles MCP-call observation automatically — see `.claude/hooks/log_mcp.sh`.

## When unsure

- For brand voice questions: re-read the relevant section of `docs/brandbook.md` rather than guessing.
- For runtime/scoring questions: re-read `BUILD_PLAN.md` and `docs/HACKATHON_BRIEF.md`.
- For MCP-tool schemas: call the tool with minimal arguments first to see the response shape; cache to `research/<tool>.json`.
- For the rest: ask the user, don't invent.

## Website production requirements (the brief is explicit on these)

The site is the primary deliverable and is judged as a deployable production candidate, not a demo. Before declaring any site-related task done, verify:

**Mobile-first.** Design and test on a 375px-wide viewport before scaling up. Tap targets ≥44px. No horizontal scroll. Text legible without zoom. The Sugar Land audience makes purchase decisions in the car on the way home — they're on phones.

**Accessibility (WCAG AA target).** Semantic HTML (`<header>`, `<main>`, `<nav>`, `<button>` not `<div onClick>`). Color contrast ≥4.5:1 for body text. Every image has meaningful `alt`. Forms have `<label>` associations. Focus indicators visible. Keyboard-only navigation must complete the order flow. Test with `axe-core` or Lighthouse a11y panel.

**Performance.** Server components for product/catalog pages so JSON-LD ships in initial HTML. Use Next.js `<Image>` for the 22 approved photos with `loading="lazy"` past the fold. Target Lighthouse: Performance ≥90 mobile, LCP ≤2.5s, CLS <0.1. No client-side data fetching for content above the fold.

**SEO.** `<title>` and `<meta description>` per page. Open Graph + Twitter card on product pages. `sitemap.xml` includes every product. `robots.txt` allows all bots. Canonical URLs. Structured data: `BakeryBreadShop` for the site, `Product` + `Offer` per product page.

**Conversion flows — separate, not generic.** The brief lists four; build them as distinct paths, not a single "contact us" form.

| Flow | Entry point | Distinguishing logic |
|---|---|---|
| Birthday cake | Catalog → product → order with custom message | Date, message-on-top text, candles ask |
| Office order | Catalog with quantity ≥3 → office form | Headcount, delivery address, invoicing note → escalation if quantity is large |
| Gift order | "Send as gift" toggle on order | Recipient name, address, hidden price, gift note |
| Custom request | Chat or form | Free-text brief → escalation to owner via Telegram for confirmation |

Each flow ends in a `square_create_order` (or escalation) with a tag in the order metadata identifying its origin. Marketing attribution and the evaluator both use this tag.

**Campaign landing pages and attribution.** Marketing-driven traffic lands on `/c/[campaign_slug]`. The route reads UTM-style params (`utm_campaign`, `utm_source`, `utm_medium`), shows a campaign-specific hero (e.g. Mother's Day creative on `cake "Honey"`), and threads the campaign id through to `square_create_order` metadata. The marketing report (`marketing_report_to_owner`) closes the loop by reconciling spend with attributed orders. Without this, marketing is open-loop and Business Analyst scores below 10/15.

**Lead capture with smart routing.** Floating "Talk to us" button → modal that asks one question: *"What do you need?"* with three options:
- *"Help choosing"* → opens the on-site assistant chat.
- *"Quick question"* → deep link to WhatsApp with prefilled context (page name, product slug).
- *"Place an order"* → goes to checkout flow.

The intent is captured and logged for marketing attribution.

## Real-adapter readiness (judged separately)

The brief scores how cleanly the system can be lifted from MCP sandbox to real production after the hackathon. Keep the path mechanical:

- All MCP calls go through `site/lib/mcp.ts` (TS) and `bots/shared/mcp_client.py` (Python). No raw MCP calls scattered in route handlers.
- Function signatures in those modules mirror real-API signatures (e.g. `createOrder({sourceId, lineItems, ...})` matches Square's shape).
- An `ARCHITECTURE.md` "Production handoff" section documents the swap, env-var-by-env-var.
- A `bots/shared/mcp_client.py` env switch (`HAPPYCAKE_MODE=sandbox|production`) is a one-flag flip; the production branch is a stub but documented.

End of project memory.
