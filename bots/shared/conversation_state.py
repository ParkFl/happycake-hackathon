"""
bots/shared/conversation_state.py — track who's driving each customer thread.

Each inbound conversation (WhatsApp number, Instagram thread, site-chat session)
has a `mode`:
  - "bot"        — agent answers automatically (default)
  - "live_owner" — owner is in the chat. Bot does NOT auto-reply; owner free-text
                   in Telegram is routed to the channel send tool.

This decouples the per-thread state from the global approval queue so we can
have multiple parallel live conversations without confusing the owner.

Storage: logs/conversations.jsonl + in-memory cache. Last write wins.
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

Mode = Literal["bot", "live_owner", "closed"]
Channel = Literal["whatsapp", "instagram", "site_chat"]

_LOCK = threading.RLock()  # reentrant — append_turn calls get_or_create which also acquires
_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_MTIME: tuple[float, int] | None = None  # (mtime, size) of file at last load


def _file() -> Path:
    log_dir = Path(os.environ.get("LOG_DIR", "./logs"))
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / "conversations.jsonl"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def thread_key(channel: Channel, identifier: str) -> str:
    """Stable per-thread key. WhatsApp uses E.164, Instagram uses threadId, site uses session id."""
    return f"{channel}:{identifier}"


def _load_cache() -> None:
    """Reload the cache from disk on every call.

    This module runs in two processes (the long-lived owner_bot and one-shot
    helper scripts that flip thread modes / push outbound). mtime-based
    invalidation isn't reliable on Windows when two writes happen within the
    same second, so we just always re-read. The file is tiny (a handful of
    JSONL records, ~2 KB) — sub-millisecond on warm OS cache.
    """
    global _CACHE_MTIME
    fp = _file()
    if not fp.exists():
        return
    try:
        mtime = fp.stat().st_mtime
        size = fp.stat().st_size
    except OSError:
        return
    # Cheap escape hatch: if both mtime and size match what we last saw, skip.
    # (Rare in practice given the two-process pattern, but harmless.)
    cache_key = (mtime, size)
    if _CACHE_MTIME == cache_key and _CACHE:
        return
    _CACHE.clear()
    with fp.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if isinstance(rec, dict) and "thread_key" in rec:
                    _CACHE[rec["thread_key"]] = rec
            except json.JSONDecodeError:
                continue
    _CACHE_MTIME = cache_key


def _persist_all() -> None:
    global _CACHE_MTIME
    fp = _file()
    tmp = fp.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for rec in _CACHE.values():
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    tmp.replace(fp)
    try:
        st = fp.stat()
        _CACHE_MTIME = (st.st_mtime, st.st_size)
    except OSError:
        _CACHE_MTIME = None


def get_or_create(channel: Channel, identifier: str, *, customer_name: str | None = None) -> dict[str, Any]:
    """Fetch the conversation record, creating an empty one if needed."""
    with _LOCK:
        _load_cache()
        key = thread_key(channel, identifier)
        if key in _CACHE:
            return _CACHE[key]
        rec = {
            "thread_key": key,
            "channel": channel,
            "identifier": identifier,
            "customer_name": customer_name,
            "mode": "bot",
            "owner_taken_at": None,
            "last_inbound_at": None,
            "last_outbound_at": None,
            "last_telegram_msg_id": None,
            "transcript": [],   # list of {role, text, ts}
            "created_at": _now(),
        }
        _CACHE[key] = rec
        _persist_all()
        return rec


def append_turn(channel: Channel, identifier: str, role: str, text: str) -> dict[str, Any]:
    """Append a turn to the thread transcript (kept short — last 20)."""
    with _LOCK:
        _load_cache()
        key = thread_key(channel, identifier)
        rec = _CACHE.get(key)
        if not rec:
            rec = get_or_create(channel, identifier)
        rec["transcript"].append({"role": role, "text": text[:1000], "ts": _now()})
        rec["transcript"] = rec["transcript"][-20:]
        if role == "customer":
            rec["last_inbound_at"] = _now()
        else:
            rec["last_outbound_at"] = _now()
        _persist_all()
        return rec


def set_mode(channel: Channel, identifier: str, mode: Mode, *, telegram_msg_id: int | None = None) -> dict[str, Any]:
    with _LOCK:
        _load_cache()
        key = thread_key(channel, identifier)
        rec = _CACHE.get(key) or get_or_create(channel, identifier)
        rec["mode"] = mode
        if mode == "live_owner":
            rec["owner_taken_at"] = _now()
        if telegram_msg_id is not None:
            rec["last_telegram_msg_id"] = telegram_msg_id
        _persist_all()
        return rec


def get(channel: Channel, identifier: str) -> dict[str, Any] | None:
    with _LOCK:
        _load_cache()
        return _CACHE.get(thread_key(channel, identifier))


def get_by_key(key: str) -> dict[str, Any] | None:
    with _LOCK:
        _load_cache()
        return _CACHE.get(key)


def push_outbound(channel: Channel, identifier: str, text: str, *, from_role: str = "owner") -> dict[str, Any]:
    """Queue an outbound message for the customer.

    Used by the site_chat live-mode flow: owner types in Telegram → we stash here →
    browser polls /api/chat/poll and pulls it out. Also doubles as the transcript
    record so /live and /focus stay accurate.
    """
    with _LOCK:
        _load_cache()
        rec = _CACHE.get(thread_key(channel, identifier)) or get_or_create(channel, identifier)
        rec.setdefault("pending_outbound", []).append({
            "text": text[:2000],
            "ts": _now(),
            "from_role": from_role,
        })
        rec["transcript"].append({"role": "agent", "text": text[:1000], "ts": _now(), "from_role": from_role})
        rec["transcript"] = rec["transcript"][-20:]
        rec["last_outbound_at"] = _now()
        _persist_all()
        return rec


def drain_outbound(channel: Channel, identifier: str) -> list[dict[str, Any]]:
    """Pop and return queued owner messages for a thread. Empties the queue."""
    with _LOCK:
        _load_cache()
        rec = _CACHE.get(thread_key(channel, identifier))
        if not rec:
            return []
        out = rec.get("pending_outbound") or []
        rec["pending_outbound"] = []
        if out:
            _persist_all()
        return out


def list_active_live() -> list[dict[str, Any]]:
    """All conversations the owner currently has live."""
    with _LOCK:
        _load_cache()
        return [r for r in _CACHE.values() if r.get("mode") == "live_owner"]


def list_recent(limit: int = 10) -> list[dict[str, Any]]:
    """Most-recently-active threads, regardless of mode."""
    with _LOCK:
        _load_cache()
        items = list(_CACHE.values())
        items.sort(key=lambda r: r.get("last_inbound_at") or r.get("last_outbound_at") or r.get("created_at") or "", reverse=True)
        return items[:limit]


def current_owner_focus() -> dict[str, Any] | None:
    """The conversation an owner free-text message should route to.

    Strategy: the most-recently-taken-over live conversation. If multiple are
    live, the owner sees a "current focus" hint in Telegram and can switch via
    /focus <thread_key>.
    """
    with _LOCK:
        _load_cache()
        live = [r for r in _CACHE.values() if r.get("mode") == "live_owner"]
        if not live:
            return None
        live.sort(key=lambda r: r.get("owner_taken_at") or "", reverse=True)
        return live[0]
