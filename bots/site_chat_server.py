"""
bots/site_chat_server.py — local FastAPI/Starlette endpoint that the production
Vercel /api/chat proxies to.

Why: Vercel serverless can't run `claude -p` (no Claude Code CLI binary in the
runtime). This local server runs alongside owner_bot on the operator's machine,
exposed via ngrok/Cloudflare Tunnel as LOCAL_AGENT_URL, and handles every site
chat turn through the brand-grounded /sales agent.

Endpoints:
  GET  /healthz      — liveness probe ({ok:true, service:"site_chat"})
  POST /site-chat    — body: ChatRequest envelope; returns {reply_text, intent, ...}

Run separately or alongside owner_bot:
  python -m bots.site_chat_server      # standalone on $SITE_CHAT_PORT (default 8001)

Environment:
  HAPPYCAKE_TEAM_TOKEN, HAPPYCAKE_MCP_URL — passed through to claude -p
  SITE_CHAT_PORT (default 8001)
  CLAUDE_BIN (default 'claude')
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
import uvicorn

_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

load_dotenv(_ROOT / ".env")

from bots.shared.claude_runner import run_claude                                # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("site_chat_server")

PORT = int(os.environ.get("SITE_CHAT_PORT", "8001"))
SHARED_TOKEN = os.environ.get("SITE_CHAT_TOKEN", "").strip()  # optional; if set, requests must include header
TURN_TIMEOUT = float(os.environ.get("SITE_CHAT_TIMEOUT", "120"))


async def healthz(_request: Request) -> JSONResponse:
    return JSONResponse({
        "ok": True,
        "service": "site_chat",
        "claude_bin": os.environ.get("CLAUDE_BIN", "claude"),
        "shared_token_required": bool(SHARED_TOKEN),
    })


async def site_chat(request: Request) -> JSONResponse:
    # Optional shared-token gate — defense-in-depth so a public ngrok URL isn't
    # an open Claude proxy that anyone can burn.
    if SHARED_TOKEN:
        provided = request.headers.get("x-site-chat-token", "")
        if provided != SHARED_TOKEN:
            logger.warning("rejected site-chat request: missing/bad x-site-chat-token")
            return JSONResponse({"error": "unauthorized"}, status_code=401)

    try:
        envelope = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)

    if not isinstance(envelope, dict) or not envelope.get("latest_message"):
        return JSONResponse({"error": "envelope.latest_message required"}, status_code=400)

    # Normalise channel — production proxy sends channel=site_chat already, but be defensive.
    envelope.setdefault("channel", "site_chat")

    try:
        result = await asyncio.wait_for(
            run_claude(
                command_name="sales",
                envelope=envelope,
                allowed_tools="Read,mcp__happycake",
                max_turns=12,
                timeout=TURN_TIMEOUT,
            ),
            timeout=TURN_TIMEOUT + 10,
        )
    except asyncio.TimeoutError:
        logger.warning("turn timed out (%.0fs) for envelope: %s", TURN_TIMEOUT, json.dumps(envelope)[:200])
        return JSONResponse({
            "reply_text": "Sorry — that took longer than expected. Send us a WhatsApp at (281) 979-8320 and we'll catch up there. — the HappyCake team",
            "intent": "agent_timeout",
        }, status_code=504)
    except Exception as e:
        logger.exception("agent run failed")
        return JSONResponse({
            "reply_text": "We're briefly offline. Reach the shop at (281) 979-8320 or DM @happycake.us on Instagram. — the HappyCake team",
            "intent": "agent_error",
            "error": str(e),
        }, status_code=502)

    return JSONResponse({
        "reply_text": result.get("reply_text") or "(empty reply — please try again)",
        "intent": result.get("intent") or "unknown",
        "actions_taken": result.get("actions_taken") or [],
        "facts_used": result.get("facts_used") or [],
        "needs_owner_approval": bool(result.get("needs_owner_approval")),
        "escalation": result.get("escalation"),
    })


web = Starlette(routes=[
    Route("/healthz", healthz, methods=["GET"]),
    Route("/site-chat", site_chat, methods=["POST"]),
])


def main() -> None:
    if not os.environ.get("HAPPYCAKE_TEAM_TOKEN"):
        raise SystemExit("HAPPYCAKE_TEAM_TOKEN missing in .env")
    logger.info(
        "site_chat_server on :%d (timeout=%.0fs, shared_token=%s)",
        PORT, TURN_TIMEOUT, "yes" if SHARED_TOKEN else "no",
    )
    uvicorn.run(web, host="0.0.0.0", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
