"""
bots/shared/mcp_client.py — sync HTTP client for the happycake MCP.

Mirrors site/lib/mcp.ts. Function signatures intentionally match real Square / WhatsApp /
Instagram / Google Business APIs so the production swap is a one-flag flip
(HAPPYCAKE_MODE=sandbox|production).

Requires: HAPPYCAKE_MCP_URL, HAPPYCAKE_TEAM_TOKEN in env (loaded by python-dotenv at app start).
"""
from __future__ import annotations

import json
import os
import threading
from typing import Any

import httpx


_DEFAULT_URL = "https://www.steppebusinessclub.com/api/mcp"
_TIMEOUT = httpx.Timeout(15.0, connect=5.0)
_RPC_LOCK = threading.Lock()
_RPC_NEXT_ID = 1


class MCPError(RuntimeError):
    """Generic MCP transport error."""

    def __init__(self, message: str, *, tool: str | None = None, args: dict | None = None) -> None:
        super().__init__(f"[mcp:{tool or '?'}] {message}")
        self.tool = tool
        self.args = args or {}


class MCPToolError(MCPError):
    """The MCP tool returned an error payload (text starts with 'Error:' or isError=true)."""

    def missing_required_fields(self) -> list[str]:
        """Parse 'Error: a, b, and c are required' into a list."""
        msg = str(self)
        marker = "Error:"
        if marker not in msg:
            return []
        tail = msg.split(marker, 1)[1]
        # 'a, b, and c are required' or 'a is required'
        if " are required" in tail:
            tail = tail.split(" are required", 1)[0]
        elif " is required" in tail:
            tail = tail.split(" is required", 1)[0]
        else:
            return []
        tail = tail.replace(",", " ").replace(" and ", " ")
        return [t.strip() for t in tail.split() if t.strip()]


def _next_id() -> int:
    global _RPC_NEXT_ID
    with _RPC_LOCK:
        nid = _RPC_NEXT_ID
        _RPC_NEXT_ID += 1
    return nid


def _client() -> httpx.Client:
    """Build a per-call httpx client. Cheap; safer than a long-lived shared one for sync use."""
    return httpx.Client(
        timeout=_TIMEOUT,
        headers={
            "Accept": "application/json, text/event-stream",
        },
    )


def call_tool(name: str, arguments: dict[str, Any] | None = None) -> Any:
    """
    Make a JSON-RPC tools/call against the happycake MCP and return the parsed payload.

    Most tools return JSON-stringified text in result.content[0].text — we parse it
    transparently. Plain-text replies are returned as-is.
    """
    url = os.environ.get("HAPPYCAKE_MCP_URL", _DEFAULT_URL)
    token = os.environ.get("HAPPYCAKE_TEAM_TOKEN")
    if not token:
        raise MCPError("HAPPYCAKE_TEAM_TOKEN not set in env", tool=name, args=arguments)

    payload = {
        "jsonrpc": "2.0",
        "id": _next_id(),
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments or {}},
    }
    headers = {
        "Content-Type": "application/json",
        "X-Team-Token": token,
    }

    with _client() as c:
        try:
            resp = c.post(url, headers=headers, json=payload)
        except httpx.HTTPError as e:
            raise MCPError(f"transport error: {e}", tool=name, args=arguments) from e

    if resp.status_code >= 400:
        raise MCPError(f"HTTP {resp.status_code}: {resp.text[:300]}", tool=name, args=arguments)

    body = resp.json()
    if "error" in body:
        raise MCPError(body["error"].get("message", "unknown error"), tool=name, args=arguments)

    result = body.get("result", {})
    content = (result.get("content") or [{}])[0]
    text = content.get("text", "")

    if result.get("isError") or text.startswith("Error:"):
        raise MCPToolError(text, tool=name, args=arguments)

    if not text:
        return None
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return text


# ---------- Convenience wrappers (typed where natural) ----------


def square_list_catalog() -> list[dict[str, Any]]:
    return call_tool("square_list_catalog").get("catalog", [])


def square_get_pos_summary() -> dict[str, Any]:
    return call_tool("square_get_pos_summary")


def square_create_order(items: list[dict[str, Any]], customer_name: str, customer_phone: str) -> dict[str, Any]:
    return call_tool("square_create_order", {
        "items": items, "customerName": customer_name, "customerPhone": customer_phone,
    })


def square_update_order_status(order_id: str, status: str) -> dict[str, Any]:
    return call_tool("square_update_order_status", {"orderId": order_id, "status": status})


def kitchen_get_production_summary() -> dict[str, Any]:
    return call_tool("kitchen_get_production_summary")


def kitchen_list_tickets() -> list[dict[str, Any]]:
    out = call_tool("kitchen_list_tickets")
    if isinstance(out, list):
        return out
    return out.get("tickets", []) if isinstance(out, dict) else []


def kitchen_create_ticket(order_id: str, customer_name: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    return call_tool("kitchen_create_ticket", {
        "orderId": order_id, "customerName": customer_name, "items": items,
    })


def kitchen_accept_ticket(ticket_id: str, estimated_minutes: int) -> dict[str, Any]:
    return call_tool("kitchen_accept_ticket", {"ticketId": ticket_id, "estimatedMinutes": estimated_minutes})


def kitchen_reject_ticket(ticket_id: str, reason: str) -> dict[str, Any]:
    return call_tool("kitchen_reject_ticket", {"ticketId": ticket_id, "reason": reason})


def kitchen_mark_ready(ticket_id: str) -> dict[str, Any]:
    return call_tool("kitchen_mark_ready", {"ticketId": ticket_id})


def marketing_create_campaign(name: str, channel: str, objective: str, target_audience: str, offer: str, budget_usd: float | None = None) -> dict[str, Any]:
    args = {
        "name": name, "channel": channel, "objective": objective,
        "targetAudience": target_audience, "offer": offer,
    }
    if budget_usd is not None:
        args["budgetUsd"] = budget_usd
    return call_tool("marketing_create_campaign", args)


def marketing_launch_simulated_campaign(campaign_id: str) -> dict[str, Any]:
    return call_tool("marketing_launch_simulated_campaign", {"campaignId": campaign_id})


def marketing_generate_leads(campaign_id: str) -> dict[str, Any]:
    return call_tool("marketing_generate_leads", {"campaignId": campaign_id})


def marketing_route_lead(lead_id: str) -> dict[str, Any]:
    return call_tool("marketing_route_lead", {"leadId": lead_id})


def marketing_report_to_owner() -> dict[str, Any]:
    return call_tool("marketing_report_to_owner")


def gb_list_reviews() -> list[dict[str, Any]]:
    out = call_tool("gb_list_reviews")
    return out if isinstance(out, list) else []


def gb_simulate_reply(review_id: str, reply: str) -> dict[str, Any]:
    return call_tool("gb_simulate_reply", {"reviewId": review_id, "reply": reply})


def gb_list_simulated_actions() -> dict[str, Any]:
    return call_tool("gb_list_simulated_actions")


def whatsapp_send(to: str, message: str) -> Any:
    return call_tool("whatsapp_send", {"to": to, "message": message})


def whatsapp_list_threads() -> dict[str, Any]:
    return call_tool("whatsapp_list_threads")


def instagram_list_dm_threads() -> dict[str, Any]:
    return call_tool("instagram_list_dm_threads")


def instagram_send_dm(thread_id: str, message: str) -> Any:
    return call_tool("instagram_send_dm", {"threadId": thread_id, "message": message})


def evaluator_get_evidence_summary() -> dict[str, Any]:
    return call_tool("evaluator_get_evidence_summary")


def evaluator_generate_team_report() -> dict[str, Any]:
    return call_tool("evaluator_generate_team_report")
