"""
bots/owner_bot.py — HappyCake owner-facing Telegram bot.

Long-running process that:
  - Listens on Telegram for commands and free text from TELEGRAM_OWNER_CHAT_ID
  - Maps /today /approvals /marketing /escalations /reviews to /owner ... runs via claude -p
  - Renders inline Approve / Edit / Reject buttons over the approval queue
  - Hosts a small HTTP endpoint at POST /escalations so site/api/chat and other
    wrappers can hand things off to the owner

Security: every handler checks update.effective_chat.id == OWNER_CHAT_ID. Anything else
is silently ignored.

Environment:
  TELEGRAM_BOT_TOKEN_OWNER, TELEGRAM_OWNER_CHAT_ID, HAPPYCAKE_TEAM_TOKEN, WEBHOOK_PORT
"""
from __future__ import annotations

import asyncio
import hashlib as _hashlib
import json
import logging
import os
import re
import sys
from pathlib import Path

import datetime as _dt
from dotenv import load_dotenv
from telegram import (
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    Update,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# Allow `python bots/owner_bot.py` from repo root or `python -m bots.owner_bot`.
_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

load_dotenv(_ROOT / ".env")

from bots.shared import approval_queue, mcp_client, conversation_state          # noqa: E402
from bots.shared.claude_runner import run_claude                                # noqa: E402

SITE_CHAT_TIMEOUT = float(os.environ.get("SITE_CHAT_TIMEOUT", "120"))
SITE_CHAT_TOKEN = os.environ.get("SITE_CHAT_TOKEN", "").strip()
REAL_PHONE_DISPLAY = "(281) 979-8320"
SITE_CHAT_FALLBACK = (
    f"We're briefly offline on the chat. Reach the shop at {REAL_PHONE_DISPLAY}, "
    f"or DM @happycake.us on Instagram, and we'll get right back to you. "
    f"— the HappyCake team"
)


async def _telegram_send(text: str, *, reply_markup: dict | None = None) -> None:
    """Direct Telegram Bot API call from any event loop.

    Why not app.bot.send_message: the PTB Bot's internal lock/httpx client gets
    bound to whichever loop touched it first; cross-loop calls (uvicorn thread →
    PTB loop) raise "Event bound to a different event loop" on Windows.
    Using a fresh httpx.AsyncClient sidesteps the issue entirely.

    We send plain text (no parse_mode) so customer-injected `_*[<` characters
    don't crash Telegram's Markdown parser.
    """
    import httpx
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    payload: dict = {
        "chat_id": OWNER_CHAT_ID,
        "text": text[:4000],
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    async with httpx.AsyncClient(timeout=10.0) as c:
        r = await c.post(url, json=payload)
        if r.status_code >= 400:
            logger.warning("telegram sendMessage HTTP %d: %s", r.status_code, r.text[:200])


def _approval_markup_dict(item_id: str) -> dict:
    """The same Approve/Edit/Reject keyboard, as a Telegram API dict (not PTB object)."""
    return {
        "inline_keyboard": [[
            {"text": "✓ Approve", "callback_data": f"approve:{item_id}"},
            {"text": "✎ Edit",    "callback_data": f"edit:{item_id}"},
            {"text": "✗ Reject",  "callback_data": f"reject:{item_id}"},
        ]]
    }


def _channel_inbound_markup(thread_key: str, channel: str, identifier: str) -> dict:
    """Buttons attached to every inbound channel notification:
       Take over (live mode) / Let bot handle / WhatsApp deep link (where applicable)."""
    row1 = [
        {"text": "🙋 Take over",     "callback_data": f"takeover:{thread_key}"},
        {"text": "🤖 Let bot handle","callback_data": f"botreply:{thread_key}"},
    ]
    rows = [row1]
    if channel == "whatsapp":
        digits = "".join(c for c in identifier if c.isdigit())
        if digits:
            rows.append([{"text": "📞 Open WhatsApp", "url": f"https://wa.me/{digits}"}])
    return {"inline_keyboard": rows}


def _handback_markup(thread_key: str) -> dict:
    return {"inline_keyboard": [[
        {"text": "↩  Hand back to bot", "callback_data": f"handback:{thread_key}"},
    ]]}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("owner_bot")

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN_OWNER", "").strip()
OWNER_CHAT_ID_RAW = os.environ.get("TELEGRAM_OWNER_CHAT_ID", "").strip()
WEBHOOK_PORT = int(os.environ.get("WEBHOOK_PORT", "8000"))

if not TOKEN:
    raise SystemExit("TELEGRAM_BOT_TOKEN_OWNER missing in .env")
try:
    OWNER_CHAT_ID = int(OWNER_CHAT_ID_RAW)
except ValueError as e:
    raise SystemExit(f"TELEGRAM_OWNER_CHAT_ID must be a numeric chat id, got {OWNER_CHAT_ID_RAW!r}") from e


# ----------------------------- helpers --------------------------------------


def _is_owner(update: Update) -> bool:
    chat = update.effective_chat
    return chat is not None and chat.id == OWNER_CHAT_ID


async def _ignore_non_owner(update: Update) -> bool:
    """If the update is not from the owner, log and return True so handlers can early-return."""
    if not _is_owner(update):
        chat = update.effective_chat
        logger.info("ignoring update from non-owner chat_id=%s", getattr(chat, "id", "?"))
        return True
    return False


def _clear_pending(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Drop any per-chat edit state. Called at the top of each slash command so a
    forgotten Edit click can't silently swallow the next free-text reply."""
    if ctx.user_data is not None:
        ctx.user_data.pop("edit_pending_id", None)


def _money(cents: int | None) -> str:
    return f"${(cents or 0) / 100:.2f}"


def _approval_keyboard(item_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        [[
            InlineKeyboardButton("✓ Approve", callback_data=f"approve:{item_id}"),
            InlineKeyboardButton("✎ Edit", callback_data=f"edit:{item_id}"),
            InlineKeyboardButton("✗ Reject", callback_data=f"reject:{item_id}"),
        ]]
    )


# ----------------------------- /start, /help --------------------------------


def _main_keyboard() -> ReplyKeyboardMarkup:
    """Persistent reply keyboard so commands are tap-able, not typed."""
    return ReplyKeyboardMarkup(
        [
            ["📊 Today", "📋 Approvals"],
            ["🛎 Escalations", "⭐ Reviews"],
            ["📈 Marketing", "🎯 Live chats"],
            ["🤖 Hand back", "❓ Help"],
        ],
        resize_keyboard=True,
        is_persistent=True,
        input_field_placeholder="Type to reply, or pick a command…",
    )


# Maps the keyboard label back to the command function (handled in on_text).
KEYBOARD_LABELS = {
    "📊 Today":      "today",
    "📋 Approvals":  "approvals",
    "🛎 Escalations":"escalations",
    "⭐ Reviews":    "reviews",
    "📈 Marketing":  "marketing",
    "🎯 Live chats": "live",
    "🤖 Hand back":  "handback",
    "❓ Help":       "help",
}


async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    await update.message.reply_text(
        "HappyCake owner bot is up.\n\n"
        "Tap a button below or type a command:\n"
        "/today — POS + kitchen snapshot\n"
        "/approvals — pending items + Approve/Edit/Reject buttons\n"
        "/escalations — open customer escalations\n"
        "/reviews — pending Google review reply drafts\n"
        "/marketing — running totals\n"
        "/marketing new <topic> — draft a campaign + queue for approval\n"
        "/live — active live conversations across channels\n"
        "/focus <thread> — switch reply focus (e.g. /focus site_chat:s-abc123)\n"
        "/handback — give the chat back to the bot\n"
        "/menu — show / refresh the keyboard below\n\n"
        "Free text:\n"
        "  · while you're live in a chat → sent to that customer (🎯 LIVE prefix)\n"
        "  · 'new campaign for X' → draft a campaign\n"
        "  · anything else → routed to /owner ask via claude -p\n\n"
        "Approve / Reject buttons under cards trigger the underlying MCP calls\n"
        "(square_create_order, kitchen_create_ticket, marketing_launch_…) and\n"
        "ALSO message the customer back on whichever channel they came from.",
        reply_markup=_main_keyboard(),
    )


async def cmd_menu(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    await update.message.reply_text("Keyboard ready.", reply_markup=_main_keyboard())


async def cmd_cancel(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Drop any pending Edit / Take-over state in case the owner gets stuck."""
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    # Also drop live-mode focus, if any.
    focus = conversation_state.current_owner_focus()
    if focus:
        conversation_state.set_mode(focus["channel"], focus["identifier"], "bot")
        await update.message.reply_text(f"Cleared. Bot resumed for {focus['thread_key']}.")
    else:
        await update.message.reply_text("Cleared. Nothing pending.")


# ----------------------------- /today ---------------------------------------


async def cmd_today(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    await update.message.reply_text("Pulling today's snapshot…")
    try:
        pos = await asyncio.to_thread(mcp_client.square_get_pos_summary)
        kitchen = await asyncio.to_thread(mcp_client.kitchen_get_production_summary)
        pending = approval_queue.count_pending()
    except Exception as e:
        await update.message.reply_text(f"⚠ Snapshot failed: {e}")
        return

    by_status = pos.get("byStatus", {}) if isinstance(pos, dict) else {}
    by_source = pos.get("bySource", {}) if isinstance(pos, dict) else {}
    lines = [
        "📊 Today",
        f"• Orders: {pos.get('orders', 0)} (revenue {_money(pos.get('revenueCents'))})",
        f"• By status: {', '.join(f'{k}={v}' for k, v in by_status.items()) or '—'}",
        f"• By source: {', '.join(f'{k}={v}' for k, v in by_source.items()) or '—'}",
        f"• Kitchen: {kitchen.get('tickets', 0)} tickets, "
        f"{kitchen.get('remainingCapacityMinutes', 0)}/{kitchen.get('dailyCapacityMinutes', 0)} min capacity left"
        + (" (over capacity)" if kitchen.get("overCapacity") else ""),
        f"• Pending approvals: {pending}",
    ]
    # Plain text — MCP responses can include underscores / asterisks that break MarkdownV1.
    await update.message.reply_text("\n".join(lines))


# ----------------------------- /approvals -----------------------------------


_KIND_HEADER = {
    "custom_order_pending_owner_approval": "🎂 Custom order — needs approval",
    "office_order_over_capacity":           "🏢 Office order over capacity",
    "complaint_resolution":                 "🔥 Customer complaint",
    "chat_handoff":                         "🙋 Hand-off requested",
    "marketing_campaign_launch":            "📈 Marketing campaign draft",
    "review_reply":                         "⭐ Google review reply draft",
}


def _looks_like_json(s: str) -> bool:
    s = (s or "").strip()
    return s.startswith(("{", "[")) and len(s) > 8


def _format_approval_card(it: dict) -> str:
    """Human-readable card for one pending approval — synthesised per-kind so
    we never spill raw JSON into the Telegram chat. Plain text only (no
    markdown), because customer-injected `_*[<` would crash MarkdownV2 parsers.
    """
    kind = it.get("kind", "item")
    payload = it.get("payload") or {}
    raw_summary = it.get("summary") or ""

    header = _KIND_HEADER.get(kind, f"📌 {kind}")
    lines = [header]

    # Use the stored summary line ONLY if it looks human-written, not a JSON dump.
    if raw_summary and not _looks_like_json(raw_summary):
        lines.append(raw_summary)

    if kind == "review_reply":
        rating = payload.get("rating")
        if rating:
            lines.append(f"Rating: {rating}★")
        draft = (payload.get("draft") or "")[:300]
        if draft:
            lines.append("")
            lines.append("Draft reply:")
            lines.append(draft)
    elif kind == "marketing_campaign_launch":
        if payload.get("name"):
            lines.append(f"Name: {payload['name']}")
        if payload.get("channel"):
            lines.append(f"Channel: {payload['channel']}")
        if payload.get("targetAudience"):
            lines.append(f"Audience: {payload['targetAudience']}")
        if payload.get("offer"):
            lines.append(f"Offer: {payload['offer']}")
        if payload.get("budgetUsd") is not None:
            try:
                lines.append(f"Budget: ${float(payload['budgetUsd']):.0f}")
            except (TypeError, ValueError):
                pass
    elif kind == "custom_order_pending_owner_approval":
        slug = payload.get("slug", "?")
        qty = payload.get("quantity", 1)
        lines.append(f"Item: {slug} ×{qty}")
        if payload.get("messageOnTop"):
            lines.append(f"On top: \"{payload['messageOnTop']}\"")
        if payload.get("pickupAt"):
            lines.append(f"Pickup: {payload['pickupAt']}")
        c = payload.get("customer") or {}
        if c.get("name") or c.get("phone"):
            lines.append(f"Reach: {(c.get('name') or '').strip()} {(c.get('phone') or '').strip()}".strip())
    elif kind in ("complaint_resolution", "chat_handoff"):
        envelope = payload.get("envelope") or {}
        latest = (envelope.get("latest_message") or "")[:300]
        if latest:
            lines.append("")
            lines.append("👤 Customer just said:")
            lines.append(f"   {latest}")
        agent_reply = (payload.get("agent_reply") or "")[:300]
        if agent_reply:
            lines.append("")
            lines.append("🤖 Agent already replied:")
            lines.append(f"   {agent_reply}")
        intent = payload.get("intent")
        if intent:
            lines.append("")
            lines.append(f"Intent: {intent}")
        sess = envelope.get("session_id")
        if sess:
            lines.append(f"Thread: site_chat:{sess[:16]}")
            lines.append("→ Tap 🙋 Take over to chat with this customer live.")
    elif kind == "office_order_over_capacity":
        items_p = payload.get("items") or []
        if items_p:
            lines.append(f"Items: {len(items_p)} line(s)")
        c = payload.get("customer") or {}
        if c.get("name") or c.get("phone"):
            lines.append(f"Reach: {(c.get('name') or '').strip()} {(c.get('phone') or '').strip()}".strip())
        if payload.get("pickupAt"):
            lines.append(f"Pickup: {payload['pickupAt']}")

    return "\n".join(lines)


def _approval_keyboard_with_takeover(item_id: str, thread_key: str | None) -> InlineKeyboardMarkup:
    """Approve / Edit / Reject + (optional) 🙋 Take over button on a separate row.
    Used for site_chat-originated escalations so the owner can flip the thread to
    live mode without typing /focus."""
    rows = [[
        InlineKeyboardButton("✓ Approve", callback_data=f"approve:{item_id}"),
        InlineKeyboardButton("✎ Edit", callback_data=f"edit:{item_id}"),
        InlineKeyboardButton("✗ Reject", callback_data=f"reject:{item_id}"),
    ]]
    if thread_key:
        rows.append([
            InlineKeyboardButton("🙋 Take over (live)", callback_data=f"takeover:{thread_key}"),
        ])
    return InlineKeyboardMarkup(rows)


def _approval_markup_dict_with_takeover(item_id: str, thread_key: str | None) -> dict:
    """Same shape as _approval_keyboard_with_takeover but as a Telegram API dict."""
    rows = [[
        {"text": "✓ Approve", "callback_data": f"approve:{item_id}"},
        {"text": "✎ Edit",    "callback_data": f"edit:{item_id}"},
        {"text": "✗ Reject",  "callback_data": f"reject:{item_id}"},
    ]]
    if thread_key:
        rows.append([{"text": "🙋 Take over (live)", "callback_data": f"takeover:{thread_key}"}])
    return {"inline_keyboard": rows}


def _kb_for_item(it: dict) -> InlineKeyboardMarkup:
    """Pick the right keyboard for an approval item — site_chat escalations get
    a Take-over button so the owner can jump straight into live chat."""
    payload = it.get("payload") or {}
    envelope = payload.get("envelope") or {}
    sess = envelope.get("session_id")
    if sess and it.get("kind") in ("complaint_resolution", "chat_handoff"):
        return _approval_keyboard_with_takeover(it["id"], f"site_chat:{sess}")
    return _approval_keyboard(it["id"])


async def cmd_approvals(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    items = approval_queue.list_pending()
    if not items:
        await update.message.reply_text("Nothing pending. ✓")
        return
    await update.message.reply_text(f"{len(items)} pending — tap a button under each card.")
    for it in items:
        try:
            text = _format_approval_card(it)
        except Exception:
            text = f"{it.get('kind', 'item')} — {it.get('summary', '?')}"
        # Plain text (no Markdown) so customer-injected `_*[<` don't crash the parser.
        await update.message.reply_text(
            text[:3800],
            reply_markup=_kb_for_item(it),
        )


# ----------------------------- /escalations ---------------------------------


async def cmd_escalations(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    items = approval_queue.filter_pending()  # all pending; escalations are kind-tagged
    escal = [it for it in items if it.get("kind") in ("complaint_resolution", "office_order_over_capacity", "custom_order_pending_owner_approval", "escalation")]
    if not escal:
        await update.message.reply_text("No open escalations.")
        return
    await update.message.reply_text(f"{len(escal)} open escalation(s):")
    for it in escal:
        try:
            text = _format_approval_card(it)
        except Exception:
            text = f"{it['kind']} — {it.get('summary', '?')}"
        await update.message.reply_text(text[:3800], reply_markup=_kb_for_item(it))


# ----------------------------- /reviews -------------------------------------


async def cmd_reviews(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Pull Google reviews + draft on-brand replies via claude -p, then queue with buttons."""
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    await update.message.reply_text("Pulling Google reviews + drafting replies (~30s)…")
    try:
        reviews = await asyncio.to_thread(mcp_client.gb_list_reviews)
        already = await asyncio.to_thread(mcp_client.gb_list_simulated_actions)
    except Exception as e:
        await update.message.reply_text(f"⚠ Reviews fetch failed: {e}")
        return

    replied_ids = {r.get("reviewId") for r in (already.get("replies") or []) if isinstance(r, dict)}
    open_reviews = [r for r in reviews if r.get("id") not in replied_ids]
    if not open_reviews:
        await update.message.reply_text("All reviews already have a reply.")
        return

    drafts = []
    for rev in open_reviews:
        envelope = {
            "command": "reviews",
            "args": {"single_review": rev},
            "transcript": [],
        }
        try:
            result = await run_claude(
                command_name="owner",
                envelope=envelope,
                extra_prompt=(
                    "For this single review, draft ONE on-brand reply per the brandbook negativity-handling rules.\n"
                    "Apologise on behalf of HappyCake (one word) for any concrete issue, sign as a person, soft CTA, English only.\n"
                    "Output only the JSON envelope with reply_text containing the draft and intent='review_reply'."
                ),
            )
            drafts.append((rev, result.get("reply_text", "(empty draft)")))
        except Exception as e:
            drafts.append((rev, f"(draft failed: {e})"))

    for rev, draft_text in drafts:
        item = approval_queue.add(
            kind="review_reply",
            summary=f"Reply to {rev.get('rating', '?')}★ from {rev.get('author', '?')}: {(rev.get('text') or '')[:60]}…",
            payload={"reviewId": rev.get("id"), "draft": draft_text, "rating": rev.get("rating")},
            channel="gbusiness",
        )
        await update.message.reply_text(
            f"⭐ Review reply draft ({rev.get('rating', '?')}★, {rev.get('author', '?')})\n\n{draft_text}",
            reply_markup=_approval_keyboard(item["id"]),
        )


# ----------------------------- /live + /focus + /handback ------------------


async def cmd_live(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """List active live (and recent) conversations across all channels."""
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    live = conversation_state.list_active_live()
    recent = conversation_state.list_recent(limit=8)
    lines = []
    if live:
        lines.append(f"🎯 Live now ({len(live)}):")
        for r in live:
            last = (r["transcript"] or [{}])[-1]
            preview = (last.get("text") or "")[:80]
            lines.append(f"  • {r['thread_key']} — {preview}")
        lines.append("")
    else:
        lines.append("🎯 No live conversations right now.")
        lines.append("")
    if recent:
        lines.append("Recent threads:")
        for r in recent:
            mode = r.get("mode", "?")
            last = (r["transcript"] or [{}])[-1]
            preview = (last.get("text") or "")[:60]
            tag = "🎯" if mode == "live_owner" else "🤖"
            lines.append(f"  {tag} {r['thread_key']} — {preview}")
    await update.message.reply_text("\n".join(lines))


async def cmd_focus(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """/focus channel:identifier — set the live thread your free text replies to."""
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    args = ctx.args or []
    if not args:
        focus = conversation_state.current_owner_focus()
        if not focus:
            await update.message.reply_text("No focus set. Usage: /focus whatsapp:+18325551002")
            return
        await update.message.reply_text(f"Current focus: {focus['thread_key']} (mode: {focus['mode']})")
        return
    key = args[0]
    if ":" not in key:
        await update.message.reply_text("Use channel:identifier (e.g. whatsapp:+18325551002)")
        return
    ch, ident = key.split(":", 1)
    if ch not in ("whatsapp", "instagram", "site_chat"):
        await update.message.reply_text(f"Unknown channel {ch}")
        return
    rec = conversation_state.set_mode(ch, ident, "live_owner")
    await update.message.reply_text(
        f"🎯 You're live in {rec['thread_key']}. Type to reply. /handback when done.",
        reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("↩  Hand back to bot", callback_data=f"handback:{rec['thread_key']}")]]),
    )


async def cmd_handback(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Hand the focused live thread back to the bot."""
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    focus = conversation_state.current_owner_focus()
    if not focus:
        await update.message.reply_text("No live thread to hand back.")
        return
    await _do_handback(focus["channel"], focus["identifier"], notify_in_chat=update.message.chat.id)


async def _do_handback(channel: str, identifier: str, *, notify_in_chat: int | None = None) -> None:
    """Switch a thread back to bot mode + tell the customer."""
    rec = conversation_state.set_mode(channel, identifier, "bot")
    notice = "Thanks for your patience — the HappyCake assistant is back. How can I help?"
    try:
        if channel == "whatsapp":
            await asyncio.to_thread(mcp_client.whatsapp_send, identifier, notice)
            conversation_state.append_turn(channel, identifier, "agent", notice)
        elif channel == "instagram":
            await asyncio.to_thread(mcp_client.instagram_send_dm, identifier, notice)
            conversation_state.append_turn(channel, identifier, "agent", notice)
        elif channel == "site_chat":
            # Browser will pick it up on the next poll tick.
            conversation_state.push_outbound(channel, identifier, notice, from_role="owner")
    except Exception as e:
        logger.warning("handback notice send failed for %s: %s", rec["thread_key"], e)
    if notify_in_chat:
        try:
            await _telegram_send(f"↩  Bot resumed for {rec['thread_key']}. Customer notified.")
        except Exception:
            pass


# ----------------------------- /marketing -----------------------------------


async def cmd_marketing(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Marketing console.

      /marketing                 → show running totals
      /marketing new <topic>     → draft a campaign + queue for approval
                                   (e.g. /marketing new Mother's Day cake "Honey")
    """
    if await _ignore_non_owner(update):
        return
    _clear_pending(ctx)
    args = ctx.args or []
    if args and args[0].lower() in ("new", "draft", "create"):
        topic = " ".join(args[1:]).strip() or "Today's bake"
        await _draft_marketing_campaign(update, topic)
        return

    await update.message.reply_text("Pulling marketing report…")
    try:
        report = await asyncio.to_thread(mcp_client.marketing_report_to_owner)
    except Exception as e:
        await update.message.reply_text(f"⚠ Marketing report failed: {e}")
        return
    summary = (
        f"📈 Marketing\n"
        f"• Budget: ${report.get('budgetUsd', 0):.0f} / target ${report.get('targetEffectUsd', 0):.0f}\n"
        f"• Campaigns: {report.get('campaignsCreated', 0)} created · {report.get('launches', 0)} launched\n"
        f"• Leads: {report.get('leadsGenerated', 0)} generated · {report.get('leadsRouted', 0)} routed\n"
        f"• Adjustments: {report.get('adjustments', 0)}\n"
        f"• Projected revenue: ${report.get('projectedRevenueUsd', 0):.0f}\n"
        f"\nDraft a new one: /marketing new <topic>\n"
        f"  e.g. /marketing new Mother's Day cake \"Honey\""
    )
    await update.message.reply_text(summary)


# Pre-curated CDN images per the brief (do NOT generate AI images, do NOT use locals).
# Keep this list in sync with site/lib/assets.ts.
_ASSET_BASE = "https://www.steppebusinessclub.com/hackathon-assets/happy-cake"
_CAMPAIGN_IMAGE_OPTIONS = [
    f"{_ASSET_BASE}/social/happy-cake-social-01.webp",
    f"{_ASSET_BASE}/social/happy-cake-social-02.webp",
    f"{_ASSET_BASE}/social/happy-cake-social-03.webp",
    f"{_ASSET_BASE}/products/happy-cake-product-01.webp",
    f"{_ASSET_BASE}/products/happy-cake-product-02.webp",
    f"{_ASSET_BASE}/hero/happy-cake-hero-01.webp",
]


async def _draft_marketing_campaign(update: Update, topic: str) -> None:
    """Run /owner with a campaign-draft envelope and queue the result for approval."""
    await update.message.reply_text(f"Drafting campaign for: {topic} (~30s)…")

    try:
        catalog = await asyncio.to_thread(mcp_client.square_list_catalog)
    except Exception as e:
        await update.message.reply_text(f"⚠ Catalog fetch failed: {e}")
        return

    envelope = {
        "command": "draft_campaign",
        "args": {
            "topic": topic,
            "catalog": [
                {"slug": c.get("kitchenProductId") or c.get("slug"), "name": c.get("name"), "priceCents": c.get("priceCents"), "category": c.get("category")}
                for c in (catalog or [])
            ],
            "image_options": _CAMPAIGN_IMAGE_OPTIONS,
        },
    }

    extra_prompt = (
        "Draft ONE marketing campaign for the topic. The owner will see your output in Telegram and "
        "press Approve to actually create + launch it via marketing_create_campaign / "
        "marketing_launch_simulated_campaign / marketing_generate_leads.\n\n"
        "Return a JSON envelope with these fields:\n"
        "  reply_text: 1-2 sentence operator-facing pitch (English, brand voice)\n"
        "  campaign: { name, channel, objective, targetAudience, offer, budgetUsd, imageUrl, sampleAdCopy }\n\n"
        "Constraints:\n"
        "  · Brandbook voice (HappyCake one word; cake names like cake \"Honey\").\n"
        "  · `channel` ∈ {instagram, whatsapp, gbusiness, email}.\n"
        "  · `offer` references ONLY products that appear in args.catalog (do NOT invent SKUs).\n"
        "  · `budgetUsd` ≤ 200.\n"
        "  · `imageUrl` MUST be one of args.image_options verbatim (no other URLs allowed).\n"
        "  · `sampleAdCopy` ≤ 280 chars, English, ≤ 1 emoji.\n"
        "Do not call any MCP tools — just read the catalog already attached."
    )

    try:
        result = await asyncio.wait_for(
            run_claude(command_name="owner", envelope=envelope, extra_prompt=extra_prompt, max_turns=4),
            timeout=90,
        )
    except Exception as e:
        await update.message.reply_text(f"⚠ Draft failed: {e}")
        return

    campaign = result.get("campaign") or {}
    if not all(campaign.get(k) for k in ("name", "channel", "objective", "targetAudience", "offer")):
        # Surface raw output so owner knows why it failed
        await update.message.reply_text(
            f"⚠ Draft missing required fields. Got:\n{json.dumps(campaign, indent=2)[:600]}\n\n"
            f"Reply text:\n{(result.get('reply_text') or '')[:400]}"
        )
        return

    item = approval_queue.add(
        kind="marketing_campaign_launch",
        summary=f"{campaign['name']} — {campaign['channel']} · {campaign['targetAudience']}",
        payload=campaign,
        channel=campaign.get("channel"),
    )

    card_lines = [
        "📈 CAMPAIGN DRAFT — tap Approve to launch",
        f"Name: {campaign['name']}",
        f"Channel: {campaign['channel']}",
        f"Objective: {campaign['objective']}",
        f"Audience: {campaign['targetAudience']}",
        f"Offer: {campaign['offer']}",
        f"Budget: ${float(campaign.get('budgetUsd') or 0):.0f}",
    ]
    if campaign.get("imageUrl"):
        card_lines.append(f"Image: {campaign['imageUrl']}")
    if campaign.get("sampleAdCopy"):
        card_lines.append("")
        card_lines.append("Sample ad copy:")
        card_lines.append(campaign["sampleAdCopy"][:400])
    if result.get("reply_text"):
        card_lines.append("")
        card_lines.append(f"Operator pitch: {result['reply_text'][:300]}")

    await update.message.reply_text("\n".join(card_lines)[:3800], reply_markup=_approval_keyboard(item["id"]))


# ----------------------------- callback query handler -----------------------


async def on_button(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if await _ignore_non_owner(update):
        return
    q = update.callback_query
    if not q or not q.data:
        return
    await q.answer()

    try:
        action, item_id = q.data.split(":", 1)
    except ValueError:
        await q.edit_message_text(f"{q.message.text}\n\n— bad callback")
        return

    if action == "edit":
        ctx.user_data["edit_pending_id"] = item_id  # next free-text message edits this item
        await q.edit_message_text(
            f"{q.message.text}\n\n— send the corrected text in the next message; I'll save it as 'edited'."
        )
        return

    # ---- Channel takeover / handback / let-bot-handle (item_id = thread_key) ----
    if action in ("takeover", "handback", "botreply"):
        thread_key = item_id
        if ":" not in thread_key:
            await q.edit_message_text(f"{q.message.text}\n\n— bad thread_key {thread_key!r}")
            return
        ch, ident = thread_key.split(":", 1)

        if action == "takeover":
            # One live chat at a time: hand back any OTHER live threads to the
            # bot so the owner's free-text in Telegram unambiguously goes to the
            # thread they just tapped, not a stale focus from earlier testing.
            for other in conversation_state.list_active_live():
                other_key = other.get("thread_key")
                if other_key and other_key != thread_key:
                    try:
                        await _do_handback(other["channel"], other["identifier"])
                        logger.info("auto-handback of %s before taking over %s", other_key, thread_key)
                    except Exception as e:
                        logger.warning("auto-handback %s failed: %s", other_key, e)

            rec = conversation_state.set_mode(ch, ident, "live_owner")
            notice = "A team member is jumping into this conversation now — give us just a moment."
            try:
                if ch == "whatsapp":
                    await asyncio.to_thread(mcp_client.whatsapp_send, ident, notice)
                    conversation_state.append_turn(ch, ident, "agent", notice)
                elif ch == "instagram":
                    await asyncio.to_thread(mcp_client.instagram_send_dm, ident, notice)
                    conversation_state.append_turn(ch, ident, "agent", notice)
                elif ch == "site_chat":
                    conversation_state.push_outbound(ch, ident, notice, from_role="owner")
            except Exception as e:
                logger.warning("takeover notice send failed for %s: %s", thread_key, e)
            await q.edit_message_text(
                f"{q.message.text}\n\n🎯 You're live in {thread_key}. Type any message — I'll send it to the customer. /handback when done.",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("↩  Hand back to bot", callback_data=f"handback:{thread_key}")]]),
            )
            return

        if action == "handback":
            await _do_handback(ch, ident)
            await q.edit_message_text(f"{q.message.text}\n\n↩  Bot resumed for {thread_key}.")
            return

        if action == "botreply":
            # Owner explicitly says "let the bot handle this" — no state change needed
            # (default is bot mode); just acknowledge.
            await q.edit_message_text(f"{q.message.text}\n\n🤖 Bot will handle it.")
            return

    if action not in ("approve", "reject"):
        await q.edit_message_text(f"{q.message.text}\n\n— unknown action {action!r}")
        return

    decision = "approved" if action == "approve" else "rejected"
    item = approval_queue.decide(item_id, status=decision)
    if not item:
        await q.edit_message_text(f"{q.message.text}\n\n— item not found")
        return

    # Side-effects per kind on approve / reject:
    follow_up: str = ""
    if action == "approve":
        try:
            follow_up = await _execute_approval(item)
        except Exception as e:
            follow_up = f"⚠ side-effect failed: {e}"
    else:  # reject
        try:
            follow_up = await _execute_rejection(item)
        except Exception as e:
            follow_up = f"⚠ rejection notify failed: {e}"

    suffix = f"\n\n— {decision}" + (f"\n{follow_up}" if follow_up else "")
    await q.edit_message_text(f"{q.message.text}{suffix}")


async def _execute_approval(item: dict) -> str:
    """Run the actual MCP call(s) that the queue item authorised."""
    kind = item.get("kind")
    payload = item.get("payload") or {}

    if kind == "review_reply":
        review_id = payload.get("reviewId")
        text = payload.get("draft") or item.get("edit_text") or ""
        if item.get("edit_text"):
            text = item["edit_text"]
        if not review_id or not text:
            return "missing reviewId or draft text"
        await asyncio.to_thread(mcp_client.gb_simulate_reply, review_id, text)
        return f"posted reply to {review_id} ({len(text)} chars)"

    if kind == "marketing_campaign_launch":
        c = payload
        try:
            created = await asyncio.to_thread(
                mcp_client.marketing_create_campaign,
                c["name"], c["channel"], c["objective"], c["targetAudience"], c["offer"], c.get("budgetUsd"),
            )
            campaign_id = (created.get("campaign") or created).get("id") or created.get("id") or created.get("campaignId")
            if not campaign_id:
                return f"created campaign but no id surfaced: {created}"
            await asyncio.to_thread(mcp_client.marketing_launch_simulated_campaign, campaign_id)
            leads = await asyncio.to_thread(mcp_client.marketing_generate_leads, campaign_id)
            for lead in (leads.get("leads") or [])[:5]:
                try:
                    await asyncio.to_thread(mcp_client.marketing_route_lead, lead["id"])
                except Exception:
                    pass
            return f"launched campaign {campaign_id} → {leads.get('generated', 0)} leads"
        except Exception as e:
            return f"campaign chain error: {e}"

    if kind == "custom_order_pending_owner_approval":
        # The site/api/order route stashed an order draft in payload — actually create it now.
        c = payload
        try:
            order = await asyncio.to_thread(
                mcp_client.square_create_order,
                [{"variationId": c["variationId"], "quantity": c.get("quantity", 1)}],
                c.get("customer", {}).get("name", "Custom"),
                c.get("customer", {}).get("phone", "+10000000000"),
            )
            ord_id = order["order"]["id"]
            kproduct_id = c.get("kitchen_product_id") or c.get("slug") or "custom-birthday-cake"
            await asyncio.to_thread(
                mcp_client.kitchen_create_ticket,
                ord_id, c.get("customer", {}).get("name", "Custom"),
                [{"productId": kproduct_id, "quantity": c.get("quantity", 1)}],
            )
            # Notify the customer back on whichever channel they came from.
            await _notify_customer_order_accepted(c, ord_id)
            return f"order {ord_id} created + kitchen ticket queued + customer notified"
        except Exception as e:
            return f"custom order chain error: {e}"

    if kind == "office_order_over_capacity":
        # Owner confirmed they can absorb the office order — treat like a custom approval.
        await _notify_customer_office_accepted(payload)
        return "office order acknowledged; customer notified"

    if kind == "complaint_resolution":
        # Owner approved the agent's recovery offer (refund, replacement, voucher).
        # Tell the customer the offer is on its way.
        await _notify_customer_complaint_resolved(payload)
        return "complaint resolution acknowledged; customer notified"

    if kind == "chat_handoff":
        # Owner approved an explicit hand-off → flip the thread to live mode so
        # their next free-text Telegram message goes straight to the customer.
        sess = ((payload.get("envelope") or {}).get("session_id"))
        if sess:
            conversation_state.set_mode("site_chat", sess, "live_owner")
            conversation_state.push_outbound(
                "site_chat", sess,
                "A team member is here now — ask anything.",
                from_role="owner",
            )
            return f"site_chat:{sess} → live_owner; customer notified"
        return "no session_id in handoff payload — cannot flip to live"

    return "approved (no automated side-effect)"


async def _execute_rejection(item: dict) -> str:
    """Owner pressed Reject — tell the customer politely and suggest alternatives.

    Why this exists: previously a Reject silently dropped the request; the
    customer was left waiting for a reply that never came. The new contract is
    that every Reject ends in a customer-facing message with a clear next step
    (alternative product, alternative day, or a direct WhatsApp hand-off).
    """
    kind = item.get("kind")
    payload = item.get("payload") or {}

    if kind in ("custom_order_pending_owner_approval", "office_order_over_capacity"):
        c = payload.get("customer") or {}
        phone = (c.get("phone") or "").strip()
        name = c.get("name") or "friend"
        slug = payload.get("slug") or "your request"
        pickup = payload.get("pickupAt") or "the requested time"
        text = (
            f"Hi {name} — sorry, the team can't take {slug} for {pickup}. "
            "Two ways forward: (1) move pickup by 24h and we can bake it fresh, "
            "(2) try one of today's classics — cake \"Honey\" (whole or slice) or cake \"Pistachio Roll\". "
            "Reply here, or message us on WhatsApp at (281) 979-8320 — the HappyCake team"
        )
        try:
            if phone:
                await asyncio.to_thread(mcp_client.whatsapp_send, phone, text)
                return f"customer {phone} notified of rejection + alternatives"
        except Exception as e:
            logger.warning("rejection notify (whatsapp) failed: %s", e)
        return "customer not reachable — no phone in payload"

    if kind in ("complaint_resolution", "chat_handoff"):
        envelope = payload.get("envelope") or {}
        sess = envelope.get("session_id")
        text = (
            "Thanks for your patience — we couldn't connect a teammate right now. "
            "If it's urgent, the fastest way is WhatsApp at (281) 979-8320 or DM @happycake.us on Instagram. "
            "Otherwise, send us your name + number here and we'll call back within the hour. "
            "— the HappyCake team"
        )
        try:
            if sess:
                conversation_state.push_outbound("site_chat", sess, text, from_role="owner")
                return f"site_chat:{sess} notified with WhatsApp/IG fallback"
        except Exception as e:
            logger.warning("rejection notify (site_chat) failed: %s", e)
        # WhatsApp/IG fallback if originating channel known
        agent_esc = payload.get("agent_escalation") or {}
        phone = ((agent_esc.get("customer_contact") or {}).get("phone")) or ""
        if phone:
            try:
                await asyncio.to_thread(mcp_client.whatsapp_send, phone, text)
                return f"customer {phone} notified via WhatsApp fallback"
            except Exception:
                pass
        return "no contact channel — owner needs to reach out manually"

    if kind == "marketing_campaign_launch":
        return "campaign draft discarded; nothing was launched"

    if kind == "review_reply":
        return "review reply draft discarded; tap /reviews to draft another"

    return "rejected (no customer notification needed)"


async def _notify_customer_order_accepted(payload: dict, order_id: str) -> None:
    """Tell the customer their custom order was accepted by the team."""
    customer = payload.get("customer") or {}
    phone = (customer.get("phone") or "").strip()
    name = customer.get("name") or "friend"
    pickup = payload.get("pickupAt") or "the time you requested"
    text = (
        f"Hi {name} — your order is approved by the team and on the bake list. "
        f"Order id: {order_id}. We'll have it ready for pickup at {pickup}. "
        "We'll text you when it's out of the oven. — the HappyCake team"
    )
    # If they came via WhatsApp we have a phone; otherwise fall back to whatever
    # channel the original escalation noted.
    channel = (payload.get("channel") or "").lower()
    try:
        if channel == "whatsapp" and phone:
            await asyncio.to_thread(mcp_client.whatsapp_send, phone, text)
        elif channel == "instagram" and payload.get("thread_id"):
            await asyncio.to_thread(mcp_client.instagram_send_dm, payload["thread_id"], text)
        elif channel == "site_chat" and payload.get("session_id"):
            conversation_state.push_outbound("site_chat", payload["session_id"], text, from_role="owner")
        elif phone:
            await asyncio.to_thread(mcp_client.whatsapp_send, phone, text)
    except Exception as e:
        logger.warning("customer notify (custom order) failed: %s", e)


async def _notify_customer_office_accepted(payload: dict) -> None:
    customer = payload.get("customer") or {}
    phone = (customer.get("phone") or "").strip()
    name = customer.get("name") or "there"
    text = (
        f"Hi {name} — the team confirmed your office order is in. "
        "We'll keep you posted on pickup time. Thanks for ordering with HappyCake."
    )
    try:
        if phone:
            await asyncio.to_thread(mcp_client.whatsapp_send, phone, text)
    except Exception as e:
        logger.warning("customer notify (office) failed: %s", e)


async def _notify_customer_complaint_resolved(payload: dict) -> None:
    """Push the agent's recovery offer to the customer (whichever channel)."""
    envelope = payload.get("envelope") or {}
    sess = envelope.get("session_id")
    text = (
        "We've sorted this out on our side — a team member will follow up with the next steps "
        "(refund / replacement) within the hour. Sorry for the trouble. — the HappyCake team"
    )
    try:
        if sess:
            conversation_state.push_outbound("site_chat", sess, text, from_role="owner")
        else:
            agent_esc = payload.get("agent_escalation") or {}
            phone = ((agent_esc.get("customer_contact") or {}).get("phone")) or ""
            if phone:
                await asyncio.to_thread(mcp_client.whatsapp_send, phone, text)
    except Exception as e:
        logger.warning("customer notify (complaint) failed: %s", e)


# ----------------------------- free text → /owner ask -----------------------


async def on_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if await _ignore_non_owner(update):
        return
    text = (update.message.text or "").strip()
    if not text:
        return

    # 1) Tap from the persistent reply-keyboard? → dispatch to that command.
    if text in KEYBOARD_LABELS:
        # Tapping a keyboard button overrides any pending Edit state — otherwise
        # an old Edit click silently swallows the next command.
        ctx.user_data.pop("edit_pending_id", None)
        cmd = KEYBOARD_LABELS[text]
        handler = {
            "today": cmd_today,
            "approvals": cmd_approvals,
            "escalations": cmd_escalations,
            "reviews": cmd_reviews,
            "marketing": cmd_marketing,
            "live": cmd_live,
            "handback": cmd_handback,
            "help": cmd_start,
        }.get(cmd)
        if handler:
            await handler(update, ctx)
            return

    # 2) Edit-pending state from a prior Edit button click → store edited text.
    pending_edit_id = ctx.user_data.pop("edit_pending_id", None)
    if pending_edit_id:
        approval_queue.decide(pending_edit_id, status="edited", edit_text=text)
        await update.message.reply_text(
            f"Saved edited text for {pending_edit_id}. Tap Approve again on the original message to apply."
        )
        return

    # 3) Live mode: if there's an active live conversation, owner's text is the reply
    #    that goes back to the customer on their original channel.
    focus = conversation_state.current_owner_focus()
    if focus:
        ch = focus["channel"]
        ident = focus["identifier"]
        try:
            if ch == "whatsapp":
                await asyncio.to_thread(mcp_client.whatsapp_send, ident, text)
                conversation_state.append_turn(ch, ident, "agent", text)
            elif ch == "instagram":
                await asyncio.to_thread(mcp_client.instagram_send_dm, ident, text)
                conversation_state.append_turn(ch, ident, "agent", text)
            elif ch == "site_chat":
                # Browser polls /site-chat/poll for these. We append-and-queue
                # in one call so the transcript and the outbound queue stay in
                # lock-step (no duplicate / missing messages).
                conversation_state.push_outbound(ch, ident, text, from_role="owner")
            else:
                await update.message.reply_text(f"⚠ Cannot send to channel {ch}.")
                return
            await update.message.reply_text(
                f"🎯 LIVE → {focus['thread_key']}\n✓ Sent.",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("↩  Hand back to bot", callback_data=f"handback:{focus['thread_key']}")]]),
            )
            return
        except Exception as e:
            logger.exception("live-mode send failed")
            await update.message.reply_text(f"⚠ Send failed for {focus['thread_key']}: {e}")
            return

    # 4) Marketing-draft shortcut for free text: "new campaign for Mother's Day"
    #    or "campaign for the office crowd" → run the same drafter as /marketing new.
    m = re.match(r"^(?:new\s+campaign|draft\s+campaign|campaign\s+for|marketing\s+for)[: ]?\s*(.*)$", text, re.IGNORECASE)
    if m:
        topic = (m.group(1) or "").strip() or "Today's bake"
        await _draft_marketing_campaign(update, topic)
        return

    # 5) Default: free-text owner question → /owner ask via claude -p.
    await update.message.reply_text("Thinking…")
    envelope = {
        "command": "ask",
        "args": {"question": text},
        "transcript": [{"role": "owner", "text": text}],
    }
    try:
        result = await run_claude(command_name="owner", envelope=envelope)
        reply = result.get("reply_text") or "(no reply)"
        await update.message.reply_text(reply[:3500])
    except Exception as e:
        logger.exception("free-text /owner ask failed")
        await update.message.reply_text(f"⚠ Agent failed: {e}")


# ----------------------------- channel inbound processing -------------------


async def _process_channel_inbound(channel: str, identifier: str, message: str, customer_name: str | None = None) -> None:
    """Handle one inbound message on WhatsApp / Instagram.

    Always: pin the message to conversation_state, ping the owner with a takeover/let-bot button.
    If thread is in 'bot' mode: also run /sales and send the agent's reply via the channel.
    If thread is in 'live_owner' mode: do NOT auto-reply. Owner is in the chat; their next free-text
    Telegram message will go to the customer (handled in on_text above).
    """
    try:
        rec = conversation_state.append_turn(channel, identifier, "customer", message)
    except Exception as e:
        logger.warning("conversation_state.append_turn failed: %s", e)
        rec = {"thread_key": f"{channel}:{identifier}", "mode": "bot"}

    thread_key = rec.get("thread_key", f"{channel}:{identifier}")
    mode = rec.get("mode", "bot")

    # Owner alert (always)
    alert_lines = [
        f"💬 {channel.upper()} from {identifier}",
        message[:600],
    ]
    if mode == "live_owner":
        alert_lines.append("")
        alert_lines.append("(You're live in this thread — type any message to reply.)")

    try:
        await _telegram_send(
            "\n".join(alert_lines),
            reply_markup=_channel_inbound_markup(thread_key, channel, identifier),
        )
    except Exception as e:
        logger.warning("owner alert for inbound %s failed: %s", thread_key, e)

    if mode == "live_owner":
        # Owner is driving — don't auto-reply. Their next Telegram message is the customer reply.
        return

    # Bot mode: run /sales agent and send via the channel
    transcript = [
        {"role": t.get("role"), "text": t.get("text")}
        for t in (rec.get("transcript") or [])[:-1]
        if t.get("role") in ("customer", "agent")
    ]
    envelope = {
        "channel": channel,
        "customer": {"id": identifier, "name": customer_name},
        "transcript": transcript,
        "latest_message": message,
    }
    try:
        result = await asyncio.wait_for(
            run_claude(command_name="sales", envelope=envelope, allowed_tools="Read,mcp__happycake", max_turns=10, timeout=SITE_CHAT_TIMEOUT),
            timeout=SITE_CHAT_TIMEOUT + 10,
        )
    except Exception as e:
        logger.exception("sales agent failed for %s", thread_key)
        result = {
            "reply_text": f"We're briefly offline. Reach the shop at {REAL_PHONE_DISPLAY}.",
            "intent": "agent_error",
            "escalation": {"reason": f"agent_error: {e}", "summary_for_owner": str(e)[:200], "customer_contact": {"phone": identifier if channel == "whatsapp" else None}},
        }

    reply = (result.get("reply_text") or "").strip() or "(no reply)"

    try:
        if channel == "whatsapp":
            await asyncio.to_thread(mcp_client.whatsapp_send, identifier, reply)
        elif channel == "instagram":
            await asyncio.to_thread(mcp_client.instagram_send_dm, identifier, reply)
    except Exception as e:
        logger.warning("channel send failed for %s: %s", thread_key, e)

    conversation_state.append_turn(channel, identifier, "agent", reply)

    # If agent flagged escalation, push a richer alert with a Take-over button
    escalation = result.get("escalation") or {}
    if escalation or result.get("intent") in ("complaint", "escalation_request"):
        try:
            await _telegram_send(
                f"🛎  Agent escalated {thread_key}\nReason: {escalation.get('reason', result.get('intent'))}\n\nAgent's reply:\n{reply[:400]}",
                reply_markup=_channel_inbound_markup(thread_key, channel, identifier),
            )
        except Exception:
            pass

    # Quiet trace so owner sees what the bot said even without escalation
    try:
        await _telegram_send(f"🤖 Agent → {thread_key}\n{reply[:400]}", reply_markup=_handback_markup(thread_key))
    except Exception:
        pass


# ----------------------------- HTTP escalation endpoint ----------------------


def _start_escalation_server(app: Application, loop: asyncio.AbstractEventLoop) -> None:
    """Run a FastAPI/uvicorn server in a background thread on WEBHOOK_PORT.
    Receives POST /escalations from site and other wrappers; pings the owner with buttons."""
    # Use Starlette directly to avoid FastAPI's `from __future__ import annotations`
    # ForwardRef resolution issues. The endpoint surface is tiny enough not to need
    # FastAPI dependency injection.
    import threading
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from starlette.routing import Route
    import uvicorn

    async def healthz(_request):
        return JSONResponse({
            "ok": True,
            "service": "owner_bot",
            "owner_chat_id": OWNER_CHAT_ID,
            "site_chat_token_required": bool(SITE_CHAT_TOKEN),
        })

    async def site_chat(request):
        """Proxy endpoint for the production site at /api/chat.

        Production Vercel route can't run `claude -p`, so it forwards here over
        ngrok / Cloudflare Tunnel. We spawn the same /sales agent locally and
        return the JSON envelope verbatim.

        If the agent's envelope has `escalation` set (complaint, owner request,
        out-of-scope), we ALSO push a Telegram alert to the owner with the
        conversation context so a real person can take over the chat.

        If the thread is already in `live_owner` mode (owner pressed Take over),
        we DO NOT run the agent — the inbound message is recorded and surfaced
        to the owner via Telegram, who replies in plain text.
        """
        if SITE_CHAT_TOKEN:
            provided = request.headers.get("x-site-chat-token", "")
            if provided != SITE_CHAT_TOKEN:
                logger.warning("rejected /site-chat: missing/bad x-site-chat-token")
                return JSONResponse({"error": "unauthorized"}, status_code=401)

        try:
            envelope = await request.json()
        except Exception:
            return JSONResponse({"error": "invalid JSON"}, status_code=400)

        if not isinstance(envelope, dict) or not envelope.get("latest_message"):
            return JSONResponse({"error": "envelope.latest_message required"}, status_code=400)

        envelope.setdefault("channel", "site_chat")

        # session_id pins this browser-side conversation to a stable thread_key
        # so the owner can take over and reply over multiple turns. Without it
        # we can't correlate a poll back to the right transcript.
        session_id = (envelope.get("session_id") or "").strip()
        if not session_id:
            session_id = "anon-" + _hashlib.sha1(json.dumps(envelope.get("transcript") or [], sort_keys=True).encode()).hexdigest()[:8]
        envelope["session_id"] = session_id

        # Record the inbound turn before anything else, so the owner sees it
        # in /live and can take over from a fresh state.
        try:
            rec_in = conversation_state.append_turn("site_chat", session_id, "customer", envelope.get("latest_message", ""))
        except Exception as e:
            logger.warning("conversation_state append for site_chat failed: %s", e)
            rec_in = {"mode": "bot", "thread_key": f"site_chat:{session_id}"}

        thread_key_now = rec_in.get("thread_key", f"site_chat:{session_id}")
        mode_now = rec_in.get("mode", "bot")

        # If the owner has already taken over this thread, DO NOT run the bot —
        # the message is theirs to handle. Tell the customer a human has it,
        # and ping the owner so they see the new turn.
        if mode_now == "live_owner":
            try:
                await _telegram_send(
                    f"💬 LIVE → {thread_key_now}\nCustomer: {envelope.get('latest_message', '')[:600]}",
                    reply_markup=_handback_markup(thread_key_now),
                )
            except Exception as e:
                logger.warning("live-mode owner ping failed for %s: %s", thread_key_now, e)
            return JSONResponse({
                "reply_text": "",  # browser shows the live transcript via /chat/poll
                "intent": "live_owner",
                "live": True,
                "session_id": session_id,
            })

        # Customer can press a "Hand off to team" button in the widget, which
        # sets handoff_request=true on the envelope. Treat that as an immediate
        # escalation regardless of what the agent decides.
        explicit_handoff = bool(envelope.get("handoff_request"))

        try:
            result = await asyncio.wait_for(
                run_claude(
                    command_name="sales",
                    envelope=envelope,
                    allowed_tools="Read,mcp__happycake",
                    max_turns=12,
                    timeout=SITE_CHAT_TIMEOUT,
                ),
                timeout=SITE_CHAT_TIMEOUT + 10,
            )
        except asyncio.TimeoutError:
            logger.warning("/site-chat timed out for envelope: %s", json.dumps(envelope)[:200])
            return JSONResponse({"reply_text": SITE_CHAT_FALLBACK, "intent": "agent_timeout"}, status_code=504)
        except Exception as e:
            logger.exception("/site-chat agent failure")
            return JSONResponse({"reply_text": SITE_CHAT_FALLBACK, "intent": "agent_error", "error": str(e)}, status_code=502)

        agent_escalation = result.get("escalation")
        intent = result.get("intent") or "unknown"

        # Escalate to owner Telegram on any of:
        #  - agent emitted .escalation field
        #  - intent classified as complaint or escalation_request
        #  - customer pressed "Hand off to team" button
        should_escalate = bool(agent_escalation) or explicit_handoff or intent in ("complaint", "escalation_request")
        if should_escalate:
            try:
                await _push_chat_escalation_to_owner(
                    app=app,
                    envelope=envelope,
                    agent_reply=result.get("reply_text") or "",
                    agent_escalation=agent_escalation,
                    intent=intent,
                    explicit_handoff=explicit_handoff,
                )
            except Exception as e:
                logger.warning("escalation push to Telegram failed: %s", e)

        # Persist the agent's outbound turn so /live transcripts stay in sync.
        try:
            conversation_state.append_turn("site_chat", session_id, "agent", result.get("reply_text") or "")
        except Exception:
            pass

        return JSONResponse({
            "reply_text": result.get("reply_text") or "(empty reply — please try again)",
            "intent": intent,
            "actions_taken": result.get("actions_taken") or [],
            "facts_used": result.get("facts_used") or [],
            "needs_owner_approval": bool(result.get("needs_owner_approval")),
            "escalation": agent_escalation,
            "handoff_acknowledged": should_escalate,
            "session_id": session_id,
            "live": False,
        })

    async def site_chat_poll(request):
        """Browser polls this when in handoff mode to pull live owner messages.

        Query: ?session_id=<id>
        Returns: { messages: [{text, ts, from_role}], mode: "bot"|"live_owner",
                   live_started: bool, session_id }

        On every call we drain the per-thread pending_outbound queue. The browser
        appends each message into the visible transcript with a 'team' badge so
        the customer knows a human is replying, not the bot.
        """
        if SITE_CHAT_TOKEN:
            provided = request.headers.get("x-site-chat-token", "")
            if provided != SITE_CHAT_TOKEN:
                return JSONResponse({"error": "unauthorized"}, status_code=401)
        session_id = (request.query_params.get("session_id") or "").strip()
        if not session_id:
            return JSONResponse({"error": "session_id required"}, status_code=400)
        try:
            rec = conversation_state.get("site_chat", session_id)
        except Exception as e:
            return JSONResponse({"error": str(e)}, status_code=500)
        if not rec:
            return JSONResponse({"messages": [], "mode": "bot", "session_id": session_id})
        try:
            outbound = conversation_state.drain_outbound("site_chat", session_id)
        except Exception:
            outbound = []
        return JSONResponse({
            "messages": outbound,
            "mode": rec.get("mode", "bot"),
            "live": rec.get("mode") == "live_owner",
            "session_id": session_id,
        })

    async def post_escalation(request):
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "invalid JSON"}, status_code=400)

        kind = body.get("kind", "escalation")
        summary = body.get("summary") or body.get("message") or json.dumps(body)[:200]
        item = approval_queue.add(
            kind=kind, summary=summary, payload=body,
            channel=body.get("channel"), customer=body.get("customer_label"),
        )

        # Telegram bot's httpx client + locks are bound to the loop they were
        # first used on. Awaiting directly here (uvicorn's loop) is safe — it's
        # the same pattern /site-chat uses successfully. Using
        # run_coroutine_threadsafe across loops triggers
        # "Event bound to a different event loop" runtime errors.
        text_lines = [
            f"NEW {kind.upper()}",
            summary,
        ]
        if body.get("customer_label"):
            text_lines.append(f"Customer: {body['customer_label']}")
        if body.get("customer") and isinstance(body["customer"], dict):
            c = body["customer"]
            label = " ".join(filter(None, [c.get("name"), c.get("phone")]))
            if label:
                text_lines.append(f"Customer: {label}")
        if body.get("slug"):
            text_lines.append(f"Slug: {body['slug']}")
        if body.get("messageOnTop"):
            text_lines.append(f"Message on top: {body['messageOnTop']}")
        if body.get("pickupAt"):
            text_lines.append(f"Pickup: {body['pickupAt']}")
        text = "\n".join(text_lines)
        if len(text) > 3800:
            text = text[:3800] + "…"

        try:
            await _telegram_send(text, reply_markup=_approval_markup_dict(item["id"]))
        except Exception as e:
            logger.warning("owner Telegram ping failed for escalation %s: %s", item["id"], e)
        return JSONResponse({"ok": True, "id": item["id"]})

    async def _push_chat_escalation_to_owner(app, envelope, agent_reply, agent_escalation, intent, explicit_handoff):
        """Fire-and-forget Telegram alert for a chat escalation.

        Reuses the approval_queue + Telegram message machinery so the owner
        can see the chat, the agent's last reply, and a deep-link to message
        the customer back on WhatsApp.
        """
        # Pull the last few turns for context (cap to avoid 4096-char Telegram limit).
        transcript = envelope.get("transcript") or []
        latest = envelope.get("latest_message", "")
        recent_context = transcript[-4:]  # last 4 prior turns
        page_context = envelope.get("page_context") or {}
        cart = page_context.get("cart") or []
        customer_phone = (
            (agent_escalation or {}).get("customer_contact", {}).get("phone")
            if agent_escalation
            else None
        )
        customer_name = (
            (agent_escalation or {}).get("customer_contact", {}).get("name")
            if agent_escalation
            else None
        )

        kind = (
            "explicit_handoff" if explicit_handoff
            else (agent_escalation or {}).get("reason", intent or "escalation")
        )

        lines = []
        if explicit_handoff:
            lines.append("🛎  Customer pressed Hand off to team")
        elif agent_escalation:
            lines.append(f"🛎  Agent escalated: {(agent_escalation or {}).get('reason', intent)}")
        else:
            lines.append(f"🛎  Intent: {intent}")

        lines.append("")
        lines.append("Last few turns:")
        for t in recent_context:
            role = t.get("role", "?")
            text = (t.get("text") or "")[:200]
            who = "Customer" if role == "customer" else "Agent"
            lines.append(f"  {who}: {text}")
        lines.append(f"  Customer (latest): {latest[:300]}")
        lines.append("")
        lines.append("Agent's reply just sent:")
        lines.append(agent_reply[:400])

        if cart:
            lines.append("")
            lines.append(f"Cart: {len(cart)} item(s)")
        if page_context.get("pathname"):
            lines.append(f"Page: {page_context['pathname']}")

        if customer_phone:
            digits = "".join(ch for ch in customer_phone if ch.isdigit())
            lines.append(f"Reach customer: https://wa.me/{digits}")
        elif customer_name:
            lines.append(f"Customer: {customer_name} (no phone in chat — reply via widget)")

        summary_one = f"Site chat needs a human ({kind})"
        item = approval_queue.add(
            kind="chat_handoff" if explicit_handoff else "complaint_resolution",
            summary=summary_one,
            payload={
                "envelope": envelope,
                "agent_reply": agent_reply,
                "agent_escalation": agent_escalation,
                "intent": intent,
            },
            channel="site_chat",
            customer=(customer_name and f"{customer_name} {customer_phone or ''}".strip()) or None,
        )

        text = "\n".join(lines)
        # Telegram cap is 4096 chars
        if len(text) > 3800:
            text = text[:3800] + "…"
        # site_chat escalations get a Take-over button so the owner can flip
        # straight into live mode without typing /focus.
        sess = (envelope.get("session_id") or "").strip()
        thread_key = f"site_chat:{sess}" if sess else None
        try:
            await _telegram_send(text, reply_markup=_approval_markup_dict_with_takeover(item["id"], thread_key))
        except Exception as e:
            logger.warning("owner Telegram alert for chat escalation failed: %s", e)

    def _dispatch_inbound(channel: str, identifier: str, message: str, customer_name: str | None) -> None:
        """Run _process_channel_inbound in a fresh OS thread with its own asyncio loop.

        Why not asyncio.create_task on uvicorn's loop: on Windows the subprocess
        call inside run_claude (SelectorEventLoop) collides with PTB's
        ProactorEventLoop and uvicorn deadlocks after the first task. A fresh
        thread with its own loop sidesteps both.
        """
        import threading

        def runner() -> None:
            logger.info("inbound thread starting: %s:%s", channel, identifier)
            # On Windows we need ProactorEventLoop for asyncio subprocess support
            # (used by run_claude via asyncio.create_subprocess_exec).
            if sys.platform == "win32":
                try:
                    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
                except Exception:
                    pass
            loop = asyncio.new_event_loop()
            try:
                asyncio.set_event_loop(loop)
                loop.run_until_complete(
                    _process_channel_inbound(channel, identifier, message, customer_name)
                )
            except Exception:
                logger.exception("dispatched inbound %s:%s crashed", channel, identifier)
            finally:
                try:
                    loop.close()
                except Exception:
                    pass
                logger.info("inbound thread done: %s:%s", channel, identifier)

        t = threading.Thread(target=runner, name=f"inbound-{channel}-{identifier[:12]}", daemon=True)
        t.start()
        logger.info("inbound thread launched id=%s for %s:%s", t.ident, channel, identifier)

    async def whatsapp_inbound(request):
        """Receive an inbound WhatsApp message (sandbox webhook OR manual injection).

        Body (lenient): { from: "+1...", message: "...", customer_name?: "..." }.
        Returns 200 OK immediately; the agent run + outbound channel send + Telegram alert
        happen in a background thread so the webhook caller (sandbox / Meta) doesn't time out.
        """
        if SITE_CHAT_TOKEN:
            provided = request.headers.get("x-site-chat-token", "")
            if provided != SITE_CHAT_TOKEN:
                return JSONResponse({"error": "unauthorized"}, status_code=401)
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "invalid JSON"}, status_code=400)
        identifier = body.get("from") or body.get("phone") or body.get("customer")
        message = body.get("message") or body.get("text") or body.get("body")
        if not identifier or not message:
            return JSONResponse({"error": "from + message required"}, status_code=400)
        _dispatch_inbound("whatsapp", str(identifier), str(message), body.get("customer_name"))
        return JSONResponse({"ok": True, "thread_key": f"whatsapp:{identifier}"})

    async def instagram_inbound(request):
        """Receive an inbound Instagram DM. Body: { threadId, from, message }."""
        if SITE_CHAT_TOKEN:
            provided = request.headers.get("x-site-chat-token", "")
            if provided != SITE_CHAT_TOKEN:
                return JSONResponse({"error": "unauthorized"}, status_code=401)
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "invalid JSON"}, status_code=400)
        thread_id = body.get("threadId") or body.get("thread_id") or body.get("from")
        message = body.get("message") or body.get("text")
        if not thread_id or not message:
            return JSONResponse({"error": "threadId + message required"}, status_code=400)
        from_handle = body.get("from") or thread_id
        _dispatch_inbound("instagram", str(thread_id), str(message), str(from_handle))
        return JSONResponse({"ok": True, "thread_key": f"instagram:{thread_id}"})

    web = Starlette(routes=[
        Route("/healthz", healthz, methods=["GET"]),
        Route("/escalations", post_escalation, methods=["POST"]),
        Route("/site-chat", site_chat, methods=["POST"]),
        Route("/site-chat/poll", site_chat_poll, methods=["GET"]),
        Route("/webhooks/whatsapp", whatsapp_inbound, methods=["POST"]),
        Route("/webhooks/instagram", instagram_inbound, methods=["POST"]),
    ])

    def serve():
        cfg = uvicorn.Config(web, host="0.0.0.0", port=WEBHOOK_PORT, log_level="warning")
        server = uvicorn.Server(cfg)
        server.run()

    th = threading.Thread(target=serve, name="escalation-http", daemon=True)
    th.start()
    logger.info("escalation HTTP server listening on :%d", WEBHOOK_PORT)


BOT_COMMANDS = [
    BotCommand("today",       "POS + kitchen snapshot"),
    BotCommand("approvals",   "Pending items + Approve/Edit/Reject buttons"),
    BotCommand("escalations", "Open customer escalations"),
    BotCommand("reviews",     "Pending Google review reply drafts"),
    BotCommand("marketing",   "Marketing totals (use 'new <topic>' to draft)"),
    BotCommand("live",        "Active live conversations across channels"),
    BotCommand("focus",       "Switch focus — /focus channel:identifier"),
    BotCommand("handback",    "Hand the live chat back to the bot"),
    BotCommand("cancel",      "Drop pending Edit / Live state — unstick yourself"),
    BotCommand("menu",        "Show / refresh the keyboard"),
    BotCommand("help",        "Help + command list"),
]


async def _daily_marketing_report(ctx: ContextTypes.DEFAULT_TYPE) -> None:
    """Send a daily marketing digest to the owner. Scheduled by PTB job_queue."""
    try:
        report = await asyncio.to_thread(mcp_client.marketing_report_to_owner)
    except Exception as e:
        logger.warning("daily marketing report failed: %s", e)
        return
    text = (
        "Daily marketing digest\n"
        f"• Budget: ${report.get('budgetUsd', 0):.0f} / target ${report.get('targetEffectUsd', 0):.0f}\n"
        f"• Campaigns: {report.get('campaignsCreated', 0)} created · {report.get('launches', 0)} launched\n"
        f"• Leads: {report.get('leadsGenerated', 0)} generated · {report.get('leadsRouted', 0)} routed\n"
        f"• Adjustments: {report.get('adjustments', 0)}\n"
        f"• Projected revenue: ${report.get('projectedRevenueUsd', 0):.0f}\n"
        f"\n{report.get('ownerSummary', '') [:600]}"
    )
    try:
        await _telegram_send(text)
    except Exception as e:
        logger.warning("daily marketing telegram send failed: %s", e)


async def _post_init(app: Application) -> None:
    loop = asyncio.get_running_loop()
    _start_escalation_server(app, loop)

    # Publish the slash-command menu so it shows up in Telegram's command picker.
    try:
        await app.bot.set_my_commands(BOT_COMMANDS)
        logger.info("Published %d Telegram commands", len(BOT_COMMANDS))
    except Exception as e:
        logger.warning("set_my_commands failed: %s", e)

    # Daily marketing digest at 09:00 UTC (~04:00 CT in summer, 03:00 CT in winter — close enough for a digest).
    if app.job_queue is not None:
        try:
            app.job_queue.run_daily(
                _daily_marketing_report,
                time=_dt.time(9, 0, tzinfo=_dt.timezone.utc),
                name="daily_marketing_report",
            )
            logger.info("Scheduled daily_marketing_report 09:00 UTC")
        except Exception as e:
            logger.warning("schedule daily_marketing_report failed: %s", e)


# ----------------------------- main -----------------------------------------


def main() -> None:
    app = Application.builder().token(TOKEN).post_init(_post_init).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_start))
    app.add_handler(CommandHandler("menu", cmd_menu))
    app.add_handler(CommandHandler("today", cmd_today))
    app.add_handler(CommandHandler("approvals", cmd_approvals))
    app.add_handler(CommandHandler("escalations", cmd_escalations))
    app.add_handler(CommandHandler("reviews", cmd_reviews))
    app.add_handler(CommandHandler("marketing", cmd_marketing))
    app.add_handler(CommandHandler("live", cmd_live))
    app.add_handler(CommandHandler("focus", cmd_focus))
    app.add_handler(CommandHandler("handback", cmd_handback))
    app.add_handler(CommandHandler("cancel", cmd_cancel))
    app.add_handler(CallbackQueryHandler(on_button))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("owner_bot polling Telegram… owner_chat_id=%s, webhook port=%d", OWNER_CHAT_ID, WEBHOOK_PORT)
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
