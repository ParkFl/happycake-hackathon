# 5-minute evaluator demo

Run `make demo` for the automated walk-through, or follow this manually.

## Setup (do once before demo)

```bash
cp .env.example .env
# Fill HAPPYCAKE_TEAM_TOKEN, TELEGRAM_BOT_TOKEN_OWNER, TELEGRAM_OWNER_CHAT_ID, NGROK_AUTHTOKEN
make install
ngrok http 8000          # in a second terminal; copy https URL into .env
make dev                 # site on :3000, bots on :8000
```

Open three windows:
- Browser at `http://localhost:3000`
- Telegram chat with `owner_bot`
- Terminal where `make dev` is running

## The 5-minute walk-through

### Minute 1 — Site walk-through (Functional + Agent-friendliness)

1. Open `http://localhost:3000`. Show the hero, then `/catalog`. Cake cards display real catalog data from MCP — point out that one is marked `24h lead` and another `Ready today` based on live kitchen capacity.
2. Open a product page (`/product/honey`). Show price, weight, allergens, lead time.
3. **View source.** Show the JSON-LD `Product` schema in the initial HTML, before any JS runs.
4. In a new tab, open `/llms.txt`. Read the "Order in 4 calls" section aloud.
5. `curl http://localhost:3000/api/catalog.json | jq` in the terminal. Show the clean schema.

### Minute 2 — On-site assistant (On-site assistant pass)

1. Click the chat widget on the product page.
2. Type: *"I need a cake for ten people on Saturday — half kids."*
3. Watch the assistant: greeting in voice, one clarifying question, recommends `cake "Milk Maiden"` with weight and price from MCP.
4. In a second tab, `tail -f logs/audit-*.jsonl | jq` — show the `square_list_catalog` call that grounded the recommendation.
5. Type: *"Actually, can you write 'Happy 5th Birthday Maya' on a cake \"Honey\" for Saturday at 11?"*
6. Show the assistant calls `kitchen_get_production_summary`, then `square_create_order`, then `kitchen_create_ticket`.

### Minute 3 — WhatsApp inbound (Functional pass)

1. In a third terminal: `bash scripts/inject-whatsapp.sh "Do you have honey cake today?"` — this drives a simulated WhatsApp inbound through the sandbox.
2. Watch the bot wrapper output. Reply ships back through the WhatsApp MCP simulator.
3. Show the response: brand voice, real availability, soft CTA, sign-off.

### Minute 4 — Owner Telegram (Operator simulator pass)

1. In Telegram with `owner_bot`, send `/today`. See the snapshot: orders today, revenue, AOV, kitchen state.
2. Send `/approvals`. See pending IG post draft (cake "Honey" reference post). Tap inline `Approve`.
3. Show in terminal that the publish action ran; in Telegram, the message updates to `✓ Approved & published`.
4. Type a freeform question: *"Should we boost the Mother's Day post?"* — the agent answers with one paragraph and a single recommendation.

### Minute 5 — Marketing loop + evidence (Business analyst + Code reviewer)

1. Send `/marketing` to `owner_bot`. The bot calls `marketing_create_campaign`, `marketing_launch_simulated_campaign`, `marketing_generate_leads`, and `marketing_report_to_owner` end-to-end. Result back in Telegram with spend / leads / conversions / ROAS by channel.
2. Open `MARKETING_PLAN.md` — show the table linking `$500` to `~$1,134` direct + `~$5,000` 90-day with retargeting, with source numbers from the seeded sales CSV.
3. Run `cat research/evidence-smoke.json | jq '. | length'` — show the audit trail count.
4. Run `make audit` — show the brand/secret/file checklist passes.

## Stop conditions

If anything fails during the demo: don't improvise. Open the failing log, point at the bug, and explain how the system handles partial failure (graceful degradation, retry, escalate). Honesty plays better than a flailing recovery.
