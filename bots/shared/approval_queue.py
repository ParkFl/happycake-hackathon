"""
bots/shared/approval_queue.py — JSONL-backed approval queue.

Every item in `pending` is one record. The owner's Telegram inline button taps
mutate the record's status to `approved`/`rejected`/`edited`. State lives on disk
in logs/approvals.jsonl so a bot restart doesn't lose the queue.

The bot polls list_pending() to render /approvals; any wrapper that needs to
escalate something writes via add().

Schema (matches bots/shared/schemas.py ApprovalItem):

    {
      "id": "ap_1ze5k",
      "ts": "2026-05-09T22:18:01.123Z",
      "kind": "social_post|marketing_campaign_launch|custom_order|review_reply|complaint_resolution|office_order|other",
      "summary": "...",
      "payload": { ... },          # arbitrary; what the bot needs to actually act on approve
      "channel": "instagram|whatsapp|gbusiness|site|owner",
      "customer": "Maya R. (+18325550199)" | null,
      "status": "pending|approved|rejected|edited",
      "decided_at": null | "...",
      "decided_by": null | "owner",
      "edit_text": null | "..."    # owner's edited text if status='edited'
    }
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

_LOCK = threading.Lock()


def _file() -> Path:
    log_dir = Path(os.environ.get("LOG_DIR", "./logs"))
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / "approvals.jsonl"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _read_all() -> list[dict[str, Any]]:
    fp = _file()
    if not fp.exists():
        return []
    items: list[dict[str, Any]] = []
    with fp.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                items.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return items


def _write_all(items: list[dict[str, Any]]) -> None:
    fp = _file()
    tmp = fp.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    tmp.replace(fp)


def add(
    *,
    kind: str,
    summary: str,
    payload: dict[str, Any] | None = None,
    channel: str | None = None,
    customer: str | None = None,
) -> dict[str, Any]:
    """Append a new pending item. Returns the stored record (with id + ts)."""
    record = {
        "id": "ap_" + uuid.uuid4().hex[:8],
        "ts": _now(),
        "kind": kind,
        "summary": summary,
        "payload": payload or {},
        "channel": channel,
        "customer": customer,
        "status": "pending",
        "decided_at": None,
        "decided_by": None,
        "edit_text": None,
    }
    with _LOCK:
        items = _read_all()
        items.append(record)
        _write_all(items)
    return record


def list_pending() -> list[dict[str, Any]]:
    with _LOCK:
        return [it for it in _read_all() if it.get("status") == "pending"]


def list_recent(n: int = 20) -> list[dict[str, Any]]:
    with _LOCK:
        return _read_all()[-n:]


def get(item_id: str) -> dict[str, Any] | None:
    with _LOCK:
        for it in _read_all():
            if it.get("id") == item_id:
                return it
    return None


def decide(item_id: str, *, status: str, edit_text: str | None = None, by: str = "owner") -> dict[str, Any] | None:
    """Set status to approved/rejected/edited. Returns the updated record or None if not found."""
    if status not in ("approved", "rejected", "edited"):
        raise ValueError(f"unknown status {status!r}")
    with _LOCK:
        items = _read_all()
        updated: dict[str, Any] | None = None
        for it in items:
            if it.get("id") == item_id:
                it["status"] = status
                it["decided_at"] = _now()
                it["decided_by"] = by
                if edit_text is not None:
                    it["edit_text"] = edit_text
                updated = it
                break
        if updated is not None:
            _write_all(items)
        return updated


def count_pending() -> int:
    return len(list_pending())


def filter_pending(kind: str | None = None) -> list[dict[str, Any]]:
    pending = list_pending()
    if kind:
        pending = [it for it in pending if it.get("kind") == kind]
    return pending
