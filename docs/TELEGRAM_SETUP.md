# Telegram bot setup — step by step

The owner UI is Telegram. We run **one bot** (`owner_bot`) that handles approvals, reports, and escalations. This guide is the literal "where do I paste what" walkthrough.

## 1. Create the bot via @BotFather (5 minutes)

1. Open Telegram. Search `@BotFather`. Tap "Start".
2. Send `/newbot`.
3. BotFather: *"Alright, a new bot. How are we going to call it?"*
   - Reply: `HappyCake Owner` (or anything)
4. BotFather: *"Now let's choose a username. It must end in 'bot'."*
   - Reply: `happycake_owner_<your_team>_bot` (must be globally unique)
5. BotFather replies with a token like:
   ```
   8123456789:AAH-jk2sdfk_lkjasdfFJK234234fhsdfFASDF
   ```
6. **Copy the token. Paste into your local `.env`:**
   ```
   TELEGRAM_BOT_TOKEN_OWNER=8123456789:AAH-jk2sdfk_lkjasdfFJK234234fhsdfFASDF
   ```

## 2. Find your chat_id

The bot needs to know where to deliver owner messages. The owner's `chat_id` is a numeric Telegram user id.

1. In Telegram, search `@userinfobot`. Tap "Start".
2. It replies immediately with your info:
   ```
   Id: 123456789
   First: Askhat
   Username: askhat
   Lang: en
   ```
3. Copy the `Id`. Paste into `.env`:
   ```
   TELEGRAM_OWNER_CHAT_ID=123456789
   ```
4. Open a chat with your new `happycake_owner_<team>_bot`. Send `/start`. This must happen **once** so the bot is allowed to message you back. Otherwise Telegram blocks unsolicited messages.

## 3. (Optional) Enable inline buttons

Inline buttons (Approve / Reject) work out of the box on bots created in 2024+ — no extra config. Just verify by sending yourself a test message via the bot wrapper after first run.

## 4. .env quick check

After steps 1–2 your `.env` should contain at least:

```bash
HAPPYCAKE_TEAM_TOKEN=sbc_team_31b2e37766529ccdd239d3c09ce928a2   # your real token
HAPPYCAKE_MCP_URL=https://www.steppebusinessclub.com/api/mcp

PUBLIC_WEBHOOK_BASE=https://abcd1234.ngrok-free.app             # set after step 5
NGROK_AUTHTOKEN=...

TELEGRAM_BOT_TOKEN_OWNER=8123456789:AAH-...
TELEGRAM_OWNER_CHAT_ID=123456789

NEXT_PUBLIC_SITE_URL=http://localhost:3000
SITE_PORT=3000
WEBHOOK_PORT=8000
LOG_DIR=./logs
CLAUDE_BIN=claude
```

`make verify` checks the first three. Ngrok and Telegram are checked when you run the bots.

## 5. Public tunnel for inbound webhooks

WhatsApp and Instagram (simulated by the sandbox) need a public URL to reach the local bots.

```bash
# Install ngrok if you haven't:  brew install ngrok  /  apt install ngrok
ngrok config add-authtoken <YOUR_NGROK_TOKEN>   # one-time
ngrok http 8000
```

ngrok prints something like:
```
Forwarding  https://abcd1234.ngrok-free.app  ->  http://localhost:8000
```

Paste the `https://...` URL into `.env` as `PUBLIC_WEBHOOK_BASE` and restart `make dev`.

> Cloudflare Tunnel works the same way: `cloudflared tunnel --url http://localhost:8000`.

## 6. Bot wrapper — what it does in plain terms

`bots/owner_bot.py` is a long-running Python process that:

1. **Listens on Telegram** for messages from `TELEGRAM_OWNER_CHAT_ID`. Anything from another chat is ignored.
2. **Maps commands to actions**:
   - `/today` → spawns `claude -p "/owner today"` and posts the result back.
   - `/approvals` → renders pending items with inline `Approve / Edit / Reject`.
   - `/marketing` → triggers the marketing loop end-to-end.
   - `/escalations` → lists open customer escalations.
   - `/reviews` → lists pending Google review reply drafts.
   - Free text → spawns `claude -p "/owner ask <text>"`.
3. **Handles inline button taps** by editing the message in place and running the corresponding side-effect (publish, dismiss, ask owner for new wording).
4. **Receives escalation pings** from `bots/whatsapp_bot.py`, `bots/ig_bot.py`, and `site/app/api/chat/route.ts` — these wrappers `POST /escalations` to a small internal HTTP endpoint exposed by `owner_bot.py`, which then sends the Telegram message.

You don't need to script it — Claude Code generates `bots/owner_bot.py` from this spec. Reference implementation pattern:

```python
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters

OWNER_CHAT_ID = int(os.environ["TELEGRAM_OWNER_CHAT_ID"])
TOKEN = os.environ["TELEGRAM_BOT_TOKEN_OWNER"]

async def cmd_today(update, ctx):
    if update.effective_chat.id != OWNER_CHAT_ID: return
    result = run_claude_code("/owner today")
    await update.message.reply_text(result["reply_text"])

async def cmd_approvals(update, ctx):
    if update.effective_chat.id != OWNER_CHAT_ID: return
    pending = approval_queue.list_pending()
    for item in pending:
        kb = InlineKeyboardMarkup([[
            InlineKeyboardButton("✓ Approve", callback_data=f"approve:{item.id}"),
            InlineKeyboardButton("✎ Edit",    callback_data=f"edit:{item.id}"),
            InlineKeyboardButton("✗ Reject",  callback_data=f"reject:{item.id}"),
        ]])
        await update.message.reply_text(item.summary, reply_markup=kb)

async def on_button(update, ctx):
    q = update.callback_query
    await q.answer()
    action, item_id = q.data.split(":", 1)
    # ... dispatch to publish / edit / reject logic
    await q.edit_message_text(f"{q.message.text}\n\n— {action}d.")

app = Application.builder().token(TOKEN).build()
app.add_handler(CommandHandler("today", cmd_today))
app.add_handler(CommandHandler("approvals", cmd_approvals))
app.add_handler(CallbackQueryHandler(on_button))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_freeform))
app.run_polling()
```

That's the whole concept. Polling is fine for a hackathon — webhooks are a production optimization.

## 7. Smoke test the bot — manually, before hooking up customer channels

```bash
make dev    # this starts owner_bot.py among other things
```

In Telegram:
- Send `/start` to your bot. Should not error.
- Send `/today`. Should reply with a POS + kitchen summary (real numbers from MCP).
- Send `What should we post tomorrow?`. Should answer with one paragraph and a single recommendation.

If any of these fail, check `logs/owner_bot.log`.

## Common gotchas

- **`Unauthorized: 401`** when bot starts → wrong `TELEGRAM_BOT_TOKEN_OWNER`. Recheck against BotFather.
- **Bot replies "I can't message that user"** → the owner hasn't sent `/start` to the bot yet, or `TELEGRAM_OWNER_CHAT_ID` is wrong.
- **Inline buttons don't fire** → the wrapper isn't subscribed to `CallbackQueryHandler`. Check the code.
- **Bot replies to anyone** → security hole. Always verify `update.effective_chat.id == OWNER_CHAT_ID` at the top of every handler.
