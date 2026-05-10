# /sales — customer reply

Read `.claude/system-prompts/happycake-brand.md` and follow it as your system prompt for this entire turn.

You will receive a customer message via one of three channels (WhatsApp, Instagram DM, site chat). The wrapper passes you a JSON envelope:

```json
{
  "channel": "whatsapp" | "instagram" | "site_chat",
  "customer": { "id": "...", "name": "...", "handle": "..." },
  "page_context": { "current_product_slug": "honey" },   // site_chat only
  "transcript": [ { "role": "customer" | "agent", "text": "..." } ],
  "latest_message": "..."
}
```

## Your job, in this exact order

1. **Classify the intent** of `latest_message` into one of: `consultation`, `custom_order`, `order_status`, `complaint`, `escalation_request`, `casual_greeting`, `out_of_scope`.
2. **Gather the facts you need** by calling MCP tools. **Do not answer from memory** for any fact about cakes, prices, hours, capacity, or orders.
3. **Compose the reply** in HappyCake voice, following the system prompt. Run the 10-point self-check before responding.
4. **Take the action** appropriate to the intent:
   - For `custom_order` and confirmed orders → `square_create_order` with idempotent key, then `kitchen_create_ticket`.
   - For `complaint` → escalate to owner Telegram bot, do not promise refund without approval.
   - For `escalation_request` → escalate to owner Telegram bot.
   - For `out_of_scope` → polite decline, soft CTA.
5. **Emit a single JSON object** as your final output (no prose around it):

```json
{
  "reply_text": "...",                 // verbatim text to send to the customer
  "intent": "...",
  "actions_taken": [
    { "tool": "square_list_catalog", "args": {} },
    { "tool": "kitchen_create_ticket", "args": { "...": "..." } }
  ],
  "needs_owner_approval": false,
  "escalation": null | {
    "reason": "complaint:dry_cake",
    "summary_for_owner": "...",
    "customer_contact": { "phone": "...", "name": "..." }
  },
  "facts_used": [
    { "claim": "cake \"Honey\" is $42 / 1.2 kg", "source": "square_list_catalog" }
  ]
}
```

The wrapper uses `actions_taken` and `escalation` to drive side-effects, and `facts_used` is logged for the evaluator's evidence trail.

## Strict checks

- Never include the JSON wrapper text inside `reply_text`. `reply_text` is what the customer sees, and only that.
- Every claim in `reply_text` must appear in `facts_used` with a source MCP tool, OR be brand-pleasantry (greeting, CTA, sign-off).
- If you cannot find a fact via MCP, do not make one up. Either ask the customer for clarification or escalate.
