# Reproducing HappyCake from a fresh clone

> **Audience:** judges + anyone running this on a new machine.
> **Time:** ~15 minutes if you have node + python + an org Discord token.
> **Outcome:** site on `localhost:3000`, owner_bot on `localhost:8000` answering
> Telegram, plus a public ngrok URL for WhatsApp / Instagram / site_chat
> webhook tests.

If you'd rather inspect the live deployment without setting anything up:

- **Site:** https://happycake-us.vercel.app
- **Repo:** https://github.com/ParkFl/happycake-hackathon
- **Brand audit:** `bash scripts/audit.sh`
- **Live evaluator score:** see [README.md "Score & evidence"](../README.md#score--evidence-evaluator_generate_team_report)

Otherwise, follow the steps below in order. Each step ends with a verification
you can copy-paste; if any of them fails, fix it before moving on.

---

## 0. Prerequisites — what's on your box

| Tool | Min version | Check |
|---|---|---|
| Node.js | 20 | `node --version` |
| Python | 3.11 | `python --version` |
| Claude Code CLI | latest | `claude --version` (`npm install -g @anthropic-ai/claude-code` if missing; then `claude login` once) |
| ngrok | any | `ngrok --version` (free account; `ngrok config add-authtoken <yours>` once) |
| git | any | `git --version` |

Plus:
- A Telegram account (to message the owner bot).
- An organizers' Discord login to request the **MCP team token** (`sbc_team_…`).

---

## 1. Clone + install (3 minutes)

```bash
git clone https://github.com/ParkFl/happycake-hackathon.git
cd happycake-hackathon
cp .env.example .env
make install
```

`make install` runs `npm install` in `site/` and `pip install -r requirements.txt`
into `bots/.venv`. If `make` is unavailable on Windows, run them by hand:

```bash
cd site && npm install && cd ..
python -m venv bots/.venv
bots/.venv/Scripts/pip install -r bots/requirements.txt   # Windows
# or: bots/.venv/bin/pip install -r bots/requirements.txt  # Mac/Linux
```

---

## 2. Fill `.env` — the only file you need to edit

Open `.env` and fill these REQUIRED fields (others have defaults):

| Var | Where to get it |
|---|---|
| `HAPPYCAKE_TEAM_TOKEN` | Organizers' Discord → request your team token. Format `sbc_team_` + 32 hex chars. |
| `TELEGRAM_BOT_TOKEN_OWNER` | [@BotFather](https://t.me/BotFather) → `/newbot` → name + username → copy the printed token (looks like `1234567:ABC…`). |
| `TELEGRAM_OWNER_CHAT_ID` | [@userinfobot](https://t.me/userinfobot) → `/start` → it replies with your numeric `Id`. |
| `NGROK_AUTHTOKEN` | https://dashboard.ngrok.com/get-started/your-authtoken |

After editing:

```bash
bash scripts/verify.sh
```

This is the 7-step health check. Expected output ends with:

```
✓ Claude CLI ✓ .env loaded ✓ MCP reachable
✓ Catalog has 5 SKUs ✓ Telegram bot reachable
✓ Hooks present ✓ Audit log directory writable
=== ALL CHECKS PASSED ===
```

If any step fails, the script prints the exact fix.

---

## 3. Start the stack (one terminal each)

### Terminal A — owner bot + escalation HTTP server

```bash
cd happycake-hackathon
bots/.venv/Scripts/python -m bots.owner_bot   # Windows
# or: bots/.venv/bin/python -m bots.owner_bot  # Mac/Linux
```

You should see:

```
INFO owner_bot: escalation HTTP server listening on :8000
INFO owner_bot: Published 10 Telegram commands
INFO telegram.ext.Application: Application started
```

In Telegram, open your bot, tap `/start`. You should get the "owner bot is up" reply with a persistent reply-keyboard. Tap **📊 Today** — you should get a real POS+kitchen snapshot pulled from MCP.

### Terminal B — public tunnel

```bash
ngrok http 8000
```

Copy the printed `https://<id>.ngrok-free.app` URL. Paste it as `LOCAL_AGENT_URL` in **two** places:

1. Local `.env` (for local-dev chat):
   ```
   LOCAL_AGENT_URL=https://<id>.ngrok-free.app
   ```
2. Vercel project (for production chat). One-shot:
   ```bash
   bash scripts/deploy.sh   # also sets HAPPYCAKE_TEAM_TOKEN + LOCAL_AGENT_URL on Vercel
   ```

### Terminal C — local site (optional, only if not using prod URL)

```bash
cd site && npm run dev
# site at http://localhost:3000
```

---

## 4. Smoke the full chain (5 minutes)

### 4a. Site → MCP path

Open https://happycake-us.vercel.app/catalog. You should see 5 SKUs with live availability badges. Click any product → **Add to cart** → checkout. The order goes through Square sandbox; refresh `/today` in Telegram to see it counted.

### 4b. On-site assistant → claude → MCP

Click the **"Talk to us"** floating button bottom-right. Ask:

> *what slices do you have today?*

Within ~30s you get a brand-voice answer with real prices from `square_list_catalog`. The reply does NOT quote raw stock counts (only "Ready today" / "Limited" / "Sold out" buckets).

### 4c. WhatsApp webhook (sandbox-simulated)

In a new terminal:

```bash
curl -sS -X POST https://<your-ngrok-id>.ngrok-free.app/webhooks/whatsapp \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "+18325559999",
    "customer_name": "Test Maya",
    "message": "Hi, do you have whole honey cake for tomorrow at 2pm?"
  }'
```

Expected: `{"ok":true,"thread_key":"whatsapp:+18325559999"}`

What happens next (within ~60s):
1. **Telegram alert fires** to owner with `💬 WHATSAPP from +18325559999` + 🙋 Take over button
2. `/sales` agent runs via `claude -p`, grounded in MCP catalog
3. `mcp_client.whatsapp_send()` is called with the brand-correct reply
4. Owner gets a follow-up `🤖 Agent → whatsapp:+18325559999` message with the reply text + ↩ Hand back button
5. The full transcript is in `logs/conversations.jsonl`

To verify the transcript was recorded:

```bash
bots/.venv/Scripts/python -c "
import sys; sys.path.insert(0, '.')
from bots.shared import conversation_state as cs
r = cs.get('whatsapp', '+18325559999')
for t in (r or {}).get('transcript', []):
    print(f'  [{t[\"role\"]}] {t[\"text\"][:200]}')
"
```

To take over the chat as a human (the headline UX):
- In the Telegram alert, tap **🙋 Take over**
- Type any message in Telegram → it goes via `mcp_client.whatsapp_send()` to the customer
- Type `/handback` to return control to the bot

### 4d. Instagram webhook (sandbox-simulated)

```bash
curl -sS -X POST https://<your-ngrok-id>.ngrok-free.app/webhooks/instagram \
  -H 'Content-Type: application/json' \
  -d '{
    "threadId": "th_ig_test_001",
    "from": "happy_customer_42",
    "message": "Saw your honey cake on Insta - what is the price?"
  }'
```

Same expected behavior — Telegram alert + agent reply via `mcp_client.instagram_send_dm()`.

### 4e. Custom-order escalation

On the site, go to https://happycake-us.vercel.app/order/custom-birthday-cake, fill the form ("Happy 60th, Mom" etc.), submit. You'll see `Sent to the team for confirmation`. In Telegram you get a 🎂 Custom order card with Approve / Edit / Reject buttons. Tap **Approve** → bot calls `square_create_order` + `kitchen_create_ticket` + WhatsApps the customer that the order is on the bake list.

If you tap **Reject** instead → the customer gets an apology + alternative cakes + WhatsApp deep-link, no silent drop.

### 4f. Marketing campaign drafting

In Telegram type:

```
/marketing new Mother's Day cake "Honey"
```

Within ~30s the bot drafts a complete campaign (name, channel, audience, offer, image URL from the approved CDN manifest, sample ad copy) and posts it as an 📈 Campaign draft card with Approve. Tap **Approve** → bot calls `marketing_create_campaign` + `marketing_launch_simulated_campaign` + `marketing_generate_leads` + routes the leads. `evaluator_get_evidence_summary` will show the count bumps.

---

## 5. The webhooks judges should know about

`owner_bot.py` exposes these HTTP endpoints on `:8000` (and via your ngrok URL):

| Method | Path | Purpose | Body shape |
|---|---|---|---|
| `GET` | `/healthz` | Liveness | — |
| `POST` | `/escalations` | Generic escalation queue add (used by site `/api/escalation`) | `{kind, customer_label, customer:{name,phone}, summary, ...}` |
| `POST` | `/site-chat` | Run `/sales` agent + Telegram alert if escalated | `{channel, session_id, latest_message, transcript:[]}` |
| `GET` | `/site-chat/poll?session_id=…` | Browser polls for live-owner replies | — (returns `{messages, mode, live, session_id}`) |
| `POST` | `/webhooks/whatsapp` | Inbound WhatsApp message → `/sales` reply | `{from, customer_name?, message}` |
| `POST` | `/webhooks/instagram` | Inbound Instagram DM → `/sales` reply | `{threadId, from, message}` |

If you set `SITE_CHAT_TOKEN` in `.env`, you must also send it as `x-site-chat-token` header on every POST, or the bot returns 401.

The Vercel `/api/chat` and `/api/escalation` routes auto-forward to whichever URL you set as `LOCAL_AGENT_URL`. So once your ngrok tunnel is live, the production site at `happycake-us.vercel.app` reaches your local bot end-to-end.

---

## 6. Commands you'll actually use

| Command | What |
|---|---|
| `make verify` | Re-run the 7-step health check |
| `make smoke` | Channel + kitchen + world + marketing smokes back-to-back |
| `make demo` | Same as smoke but slower with intermediate prints, for screen-recording |
| `make audit` | Brand-wordmark + secret-scan pre-commit |
| `bash scripts/deploy.sh` | Deploy `site/` to Vercel production (re-uses `.vercel/` link) |
| `bash scripts/channel_smoke.sh` | Single-call WhatsApp/IG/GB simulation (debug counters) |

---

## 7. Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `Unauthorized: 401` from MCP | wrong `HAPPYCAKE_TEAM_TOKEN` | get a fresh one in Discord |
| Owner bot starts but `/today` says nothing | `TELEGRAM_OWNER_CHAT_ID` doesn't match the chat where you're typing | get id from @userinfobot, also send `/start` to the bot once |
| Site chat replies "We're briefly offline…" | ngrok tunnel down or `LOCAL_AGENT_URL` not set on Vercel | start `ngrok http 8000`, paste URL into Vercel env, redeploy |
| `/site-chat` returns 401 | `SITE_CHAT_TOKEN` set on bot but missing on caller | match values on both sides or unset everywhere |
| Webhook returns `{"error":"invalid JSON"}` | bash quoting mangled your payload | put the JSON in a file and use `--data @payload.json` |
| Telegram cards show JSON dumps | running an old commit | `git pull` and restart bot |
| Agent quotes raw stock numbers | brand prompt out of date | latest `.claude/system-prompts/happycake-brand.md` rule #0 forbids this |

---

## 8. What "reproducing the project" actually means here

Per the brief and the live evaluator (`evaluator_generate_team_report`), the evidence is:

1. **`mcp_audit_log`** — every MCP call your team token makes against the sandbox is recorded server-side. The evaluator counts these.
2. **The site at the URL** — judges browse it like a real customer and AI agent.
3. **The repo on GitHub** — Code Reviewer reads README, runs `make install`, follows this REPRODUCE.md.

Our README + this file + `make verify` + the 4 smoke scripts are designed so a fresh clone with one Discord-issued token gets you to a working stack in under 15 minutes. If anything in this doc is wrong on your machine, **that's a bug — open an issue or message the team**.
