"""
bots/kitchen_automator.py — drives kitchen tickets through their lifecycle.

This is a deterministic loop, not an LLM in the loop. The agent only steps in for
conversational moments; capacity decisions are pure arithmetic.

Loop (every TICK_SECONDS):
  1. kitchen_list_tickets — find queued tickets we created but haven't decided on
  2. For each queued ticket:
       - kitchen_get_production_summary
       - if remainingCapacityMinutes >= ticket.estimatedPrepMinutes:
            kitchen_accept_ticket + square_update_order_status(in_kitchen)
            schedule mark_ready at estimatedReadyAt
         else:
            kitchen_reject_ticket(reason="over capacity")
            POST escalation to owner_bot
  3. For each accepted ticket whose estimatedReadyAt <= now:
       - kitchen_mark_ready + square_update_order_status(ready)
  4. For each ready ticket older than READY_TIMEOUT_HOURS:
       - square_update_order_status(completed)  (auto-complete safety net)
"""
from __future__ import annotations

import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

load_dotenv(_ROOT / ".env")

from bots.shared import mcp_client                                              # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("kitchen_automator")

TICK_SECONDS = float(os.environ.get("KITCHEN_TICK_SECONDS", "5"))
READY_TIMEOUT_HOURS = float(os.environ.get("KITCHEN_READY_TIMEOUT_HOURS", "24"))
WEBHOOK_PORT = int(os.environ.get("WEBHOOK_PORT", "8000"))
OWNER_BOT_BASE = f"http://127.0.0.1:{WEBHOOK_PORT}"


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        # Accept both "Z" and "+00:00" suffixes.
        if ts.endswith("Z"):
            ts = ts[:-1] + "+00:00"
        return datetime.fromisoformat(ts)
    except Exception:
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _post_escalation(payload: dict[str, Any]) -> None:
    """Best-effort POST to owner_bot's HTTP endpoint."""
    try:
        with httpx.Client(timeout=5.0) as c:
            c.post(f"{OWNER_BOT_BASE}/escalations", json=payload)
    except Exception as e:
        logger.warning("escalation POST failed: %s", e)


def _normalize_tickets(tickets_raw: Any) -> list[dict[str, Any]]:
    if isinstance(tickets_raw, list):
        return tickets_raw
    if isinstance(tickets_raw, dict):
        for key in ("tickets", "items", "data"):
            if isinstance(tickets_raw.get(key), list):
                return tickets_raw[key]
    return []


def tick() -> None:
    try:
        tickets_raw = mcp_client.kitchen_list_tickets()
        summary = mcp_client.kitchen_get_production_summary()
    except Exception as e:
        logger.warning("snapshot failed: %s", e)
        return

    tickets = _normalize_tickets(tickets_raw)
    remaining = int(summary.get("remainingCapacityMinutes", 0))

    for t in tickets:
        tid = t.get("id") or t.get("ticketId")
        status = (t.get("status") or "").lower()
        prep = int(t.get("estimatedPrepMinutes", 0) or 0)
        order_id = t.get("orderId")

        if not tid:
            continue

        if status == "queued":
            if remaining >= prep > 0:
                try:
                    mcp_client.kitchen_accept_ticket(tid, prep)
                    if order_id:
                        mcp_client.square_update_order_status(order_id, "in_kitchen")
                    logger.info("accepted %s (order %s, %d min, capacity now %d)", tid, order_id, prep, remaining - prep)
                    remaining -= prep
                except Exception as e:
                    logger.warning("accept_ticket failed for %s: %s", tid, e)
            else:
                reason = f"Over capacity: need {prep} min, only {remaining} min remaining today."
                try:
                    mcp_client.kitchen_reject_ticket(tid, reason)
                    logger.info("rejected %s — %s", tid, reason)
                except Exception as e:
                    logger.warning("reject_ticket failed for %s: %s", tid, e)
                _post_escalation({
                    "kind": "office_order_over_capacity",
                    "summary": f"Kitchen rejected ticket {tid}: {reason}",
                    "channel": "kitchen",
                    "ticket": t,
                })
            continue

        if status == "accepted":
            ready_at = _parse_iso(t.get("estimatedReadyAt"))
            if ready_at and ready_at <= _now():
                try:
                    mcp_client.kitchen_mark_ready(tid)
                    if order_id:
                        mcp_client.square_update_order_status(order_id, "ready")
                    logger.info("marked ready: %s (order %s)", tid, order_id)
                except Exception as e:
                    logger.warning("mark_ready failed for %s: %s", tid, e)
            continue

        if status == "ready":
            ready_at = _parse_iso(t.get("readyAt") or t.get("estimatedReadyAt"))
            if ready_at and (_now() - ready_at).total_seconds() > READY_TIMEOUT_HOURS * 3600:
                try:
                    if order_id:
                        mcp_client.square_update_order_status(order_id, "completed")
                    logger.info("auto-completed stale ready ticket %s (order %s)", tid, order_id)
                except Exception as e:
                    logger.warning("auto-complete failed for %s: %s", tid, e)
            continue


def main() -> None:
    if not os.environ.get("HAPPYCAKE_TEAM_TOKEN"):
        raise SystemExit("HAPPYCAKE_TEAM_TOKEN missing in .env")
    logger.info("kitchen_automator started — tick=%.1fs, ready_timeout=%.1fh, owner_bot=%s",
                TICK_SECONDS, READY_TIMEOUT_HOURS, OWNER_BOT_BASE)
    while True:
        try:
            tick()
        except Exception:
            logger.exception("tick crashed")
        time.sleep(TICK_SECONDS)


if __name__ == "__main__":
    main()
