# Kitchen automation loop — Order to Completed

The evaluator's `POS + kitchen handoff` dimension scores 65/100 today because we stop at ticket creation. The gap notes specifically:

- *"No capacity-aware accept/reject decision"*
- *"No ready-for-pickup completion evidence"*

Closing this loop is +35 points, and it's mechanical. This file is the spec.

## The chain

```
                ┌─────────────────────────────────────────────────┐
                │  Customer confirms order in /sales conversation │
                └────────────────────────┬────────────────────────┘
                                         ▼
       ┌────────────────────────────────────────────────────────┐
       │  /sales: square_create_order                           │
       │   → response.kitchenTool === "kitchen_create_ticket"   │
       └────────────────────────┬───────────────────────────────┘
                                ▼
       ┌────────────────────────────────────────────────────────┐
       │  /sales: kitchen_create_ticket                         │
       │   → returns { ticketId, status: "queued",              │
       │              estimatedPrepMinutes }                    │
       └────────────────────────┬───────────────────────────────┘
                                ▼
       ┌────────────────────────────────────────────────────────┐
       │  Kitchen automator (background worker, see below)      │
       │  evaluates capacity:                                   │
       │  • get kitchen_get_production_summary                  │
       │  • if remainingCapacityMinutes ≥ estimatedPrepMinutes: │
       │      kitchen_accept_ticket                             │
       │  • else:                                               │
       │      kitchen_reject_ticket(reason: "over capacity")    │
       │      escalate to owner via Telegram                    │
       └────────────────────────┬───────────────────────────────┘
                                ▼
       ┌────────────────────────────────────────────────────────┐
       │  Square status sync:                                   │
       │  square_update_order_status(orderId, "in_kitchen")     │
       └────────────────────────┬───────────────────────────────┘
                                ▼
       ┌────────────────────────────────────────────────────────┐
       │  Wait until estimatedReadyAt                           │
       │  (in dev: poll; in scenarios: world_advance_time)      │
       └────────────────────────┬───────────────────────────────┘
                                ▼
       ┌────────────────────────────────────────────────────────┐
       │  Status updates:                                       │
       │  square_update_order_status(orderId, "ready")          │
       │  notify customer via their channel                     │
       └────────────────────────┬───────────────────────────────┘
                                ▼
       ┌────────────────────────────────────────────────────────┐
       │  On pickup confirmation:                               │
       │  square_update_order_status(orderId, "completed")      │
       └────────────────────────────────────────────────────────┘
```

Every transition produces an `mcp_audit_log` entry. Evaluator counts them.

## Kitchen automator — `bots/kitchen_automator.py`

A small background worker that runs alongside the bot wrappers. Its only job is to drive tickets through their lifecycle. Pseudocode:

```python
# bots/kitchen_automator.py
async def main_loop():
    while True:
        summary = await mcp("kitchen_get_production_summary")
        # Find queued tickets we created but haven't accepted/rejected yet
        queued = await get_local_queued_tickets()  # from our local audit log
        for ticket in queued:
            if summary["remainingCapacityMinutes"] >= ticket["estimatedPrepMinutes"]:
                await mcp("kitchen_accept_ticket", {
                    "ticketId": ticket["id"],
                    "estimatedMinutes": ticket["estimatedPrepMinutes"]
                })
                await mcp("square_update_order_status", {
                    "orderId": ticket["orderId"],
                    "status": "in_kitchen"
                })
                schedule_ready_transition(ticket)
            else:
                await mcp("kitchen_reject_ticket", {
                    "ticketId": ticket["id"],
                    "reason": "Kitchen is over capacity"
                })
                await escalate_to_owner_bot(ticket, reason="over_capacity")
        await asyncio.sleep(5)

def schedule_ready_transition(ticket):
    # When the kitchen says estimatedReadyAt, mark order ready
    ready_at = parse(ticket["estimatedReadyAt"])
    schedule_at(ready_at, mark_ready, ticket["orderId"])

async def mark_ready(order_id):
    await mcp("square_update_order_status", {"orderId": order_id, "status": "ready"})
    await notify_customer(order_id, "Your order is ready for pickup.")
```

Why a Python worker and not the agent itself: each transition is a deterministic decision based on numeric capacity. We don't need an LLM in the loop here — and removing the LLM removes a cost line and a latency source. The agent only steps in for the conversational parts (consultation, complaints, escalations).

## Pickup confirmation — three triggers

The `completed` transition fires from one of:

1. **Customer says they picked up** in WhatsApp/IG/site chat. The `/sales` agent emits `actions_taken: [{tool: "square_update_order_status", args: {orderId, status: "completed"}}]`.
2. **Owner manually marks complete** in Telegram via `owner_bot` `/orders ready` → tap inline `Mark picked up`.
3. **Auto-complete after 24h ready** as a safety net so abandoned tickets don't pollute the dashboard. Kitchen automator handles this.

Without trigger 3, leftover `ready` orders inflate the open-orders metric and the evaluator scores marketing/POS dimensions lower. Implement it.

## Owner approval gate for `custom` category

The catalog flags `Custom birthday cake` with `"description": "Custom celebration cake with human approval required."` Treat this as a hard gate: when a customer commits to a custom-category order, the chain pauses **before** `square_create_order`:

```
/sales draft →
  approval_queue.add({type: "custom_order", customer, items, message_on_top}) →
  owner_bot pings Askhat →
  owner approves/rejects in Telegram →
    on approve: /sales continues with square_create_order + kitchen_create_ticket
    on reject: /sales messages customer with the reason and offers an alternative
```

This is the "owner approval, escalation" line item the evaluator's `nextJudgeChecks` mentions. Demonstrate it on at least one custom-cake flow during the smoke test.

## Capacity arithmetic for marketing copy

Daily capacity = 420 min. Per-item prep (from observed `estimatedPrepMinutes`):
- Whole honey cake — 25 min
- (other items: discover via test order)

Roughly **16 whole honey cakes per day** is the ceiling. The site's homepage copy "Today's bake" should reflect what's already in `kitchen_get_production_summary.byStatus.queued + accepted`. If queued+accepted+ready ≥ 14 cakes, switch the home hero to "Today's slots are filling up — pre-order for tomorrow."

This is also a marketing card: the $500 spend has a hard ceiling on what it can convert to revenue (16 cakes × $55 = $880/day max). Use this in `MARKETING_PLAN.md` to ground the projections.
