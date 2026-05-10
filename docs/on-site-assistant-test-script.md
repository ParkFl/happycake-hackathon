# On-site assistant — test script

Five canonical conversations the on-site chat assistant must handle. The evaluator-on-site-assistant pass will run scenarios shaped like these. Each one tests a different rubric criterion: MCP-grounded facts, capacity honesty, escalation, and brand voice.

## How to run

```bash
make dev                          # site on :3000, bots on :8000
# Open http://localhost:3000, click the chat widget bottom-right
```

For each test below: open the chat fresh, paste the customer line, observe the agent's reply. Expected behaviour is described — not a verbatim script. The agent must produce factually correct, brand-compliant responses based on **live MCP data**, not hardcoded answers.

---

### Test 1 — Consultation

**Customer:** "Hi, I'm hosting ten people on Saturday and need a cake. Mostly adults, a couple of kids. What would you recommend?"

**Expected behaviour:**
- Greeting in HappyCake voice (not "Hey there!" — see brandbook).
- Asks at most one clarifying question (e.g. pickup or delivery, occasion).
- Recommends 1–2 cakes from the catalog. For mixed-age, `cake "Milk Maiden"` is the go-to. For adult-leaning, `cake "Honey"` or `cake "Napoleon"`.
- Quotes weight and price **from `square_list_catalog`** — verifiable in `logs/audit-*.jsonl`.
- States lead time honestly. If 24h, suggests Saturday 11:00 pickup.
- Closes with the soft CTA.

**Anti-patterns to fail on:**
- Inventing a cake or price.
- Writing `Honey cake` or `Happy Cake`.
- More than two epithets in the description.
- More than three emojis.

---

### Test 2 — Custom order

**Customer:** "Can you write 'Happy 5th Birthday Maya' on top of a cake \"Honey\" for pickup tomorrow at 4pm?"

**Expected behaviour:**
- Confirms what's possible: text on top, yes; figurines / themed shapes, no.
- Pulls capacity for tomorrow 4pm from `kitchen_get_production_summary`.
- If capacity is fine: asks for customer name + phone, calls `square_create_order` (idempotent), then `kitchen_create_ticket` with the message text and pickup time.
- Replies with order id and ready-time.
- If capacity is tight: offers the next available slot, does not promise.

**Anti-patterns to fail on:**
- Promising tomorrow 4pm without checking the kitchen.
- Saying "We can do anything!" — we can't, and the brandbook is explicit.

---

### Test 3 — Complaint

**Customer:** "I picked up a cake yesterday and it was dry. Disappointed."

**Expected behaviour:**
- Apologises immediately on behalf of HappyCake. **Apology comes before any explanation or question.**
- Doesn't blame the customer or quote policy.
- Asks one clarifying question (which cake, order id if known).
- Escalates to owner via Telegram bot — message in `mcp_audit_log` and visible in the owner bot's `/escalations`.
- Tells the customer: "I've passed this to Askhat. He'll be in touch within the hour."
- Does **not** promise a specific refund or replacement before owner approval.

**Anti-patterns to fail on:**
- "Sorry you feel that way."
- "Per our policy, we cannot exchange products."
- Promising a refund or replacement without escalation.

---

### Test 4 — Order status

**Customer:** "What's the status on order HC-1234?"

**Expected behaviour:**
- Looks up the order via `square_get_pos_summary` or order-lookup tool.
- Reports a specific status: kitchen, ready, picked up, with a time.
- If late: apologises, gives an honest new ETA, escalates if delay > 30 min.

**Anti-patterns:**
- Vague "we're working on it" with no time.
- Inventing a status.

---

### Test 5 — Escalation request

**Customer:** "I need to speak with the owner directly."

**Expected behaviour:**
- Acknowledges the request without resistance. No "let me try to help first" loop.
- Asks one question if needed: short summary so Askhat has context.
- Posts an escalation to the owner Telegram bot. The message includes channel, customer name/handle, conversation snippet, and reason.
- Tells the customer: "I've passed this to Askhat. He'll reach out within the hour."

**Anti-patterns:**
- Refusing to escalate.
- Promising a callback time the owner hasn't confirmed.

---

### Test 6 — Office order (separate conversion flow)

**Customer:** "I need to order cakes for our office party next Friday — about 25 people. What do you recommend and can you deliver?"

**Expected behaviour:**
- Identifies office-order intent (qty implied ≥3).
- Pulls catalog and capacity. For 25 people, recommends e.g. two `cake "Honey"` + one `cake "Milk Maiden"` (counts: ~8–10 slices per cake).
- Asks for: pickup or delivery, delivery address if delivery, billing/invoicing preference (some offices need invoice not card), point-of-contact name + phone.
- For Friday (likely high lead time): confirms via `kitchen_get_production_summary`. If capacity is tight, offers an alternative day or a smaller cake mix.
- Creates the order with metadata tag `flow=office`. If quantity is large enough to merit owner confirmation (configurable threshold, e.g. ≥3 cakes), escalates to owner first.
- Does **not** quote bulk discounts — there's no bulk-discount policy in the brandbook.

**Anti-patterns:**
- Treating it as a single birthday cake.
- Promising delivery without confirming the address is in service area (Sugar Land + Houston metro).

---

### Test 7 — Gift order

**Customer:** "I'd like to send a cake \"Tiramisu\" to my mom for Mother's Day. She lives in Sugar Land. Can you include a note that says 'Love you, Mom'?"

**Expected behaviour:**
- Recognises gift-flow distinct from a regular order: recipient is not the buyer.
- Captures: recipient name + delivery address + preferred delivery window, sender's payment contact, hidden price (no receipt in the box), gift note text.
- Creates the order with metadata `flow=gift, hide_price=true`.
- Confirms: "We'll deliver cake \"Tiramisu\" to <recipient> at <address> with the note 'Love you, Mom'. The box won't include a price."
- Soft CTA close.

**Anti-patterns:**
- Forgetting to ask about the note text or hiding the price.
- Confusing the recipient with the customer in the order record.

---

### Test 8 — Google review reply (owner-bot drives this, not the on-site assistant)

This isn't an on-site test, but belongs in the same QA suite. Run via `owner_bot` `/reviews`:

**Setup:** Trigger a `world_next_event` that injects a 3-star Google review: *"Cake was good but pickup took forever — waited 30 minutes past my time."*

**Expected behaviour:**
- The review surfaces in the owner bot's `/reviews` queue with inline `Reply` / `Skip` buttons.
- On `Reply`, the agent drafts a brand-voice response: apologises specifically for the wait (does not blame the customer), thanks them for naming the issue, offers a small make-good (e.g. "next time, please mention this — coffee on us"), signs as a person.
- The draft goes to owner approval before publishing. On approve, the agent calls the Google Business reply tool; on reject, it asks for the owner's preferred wording.

**Anti-patterns:**
- Generic "Thank you for your feedback!" with no acknowledgement of the wait.
- Auto-publishing without owner approval (review replies are public-facing — same approval bar as social posts).
- Defending the wait or quoting a policy.

---

## What the evaluator will check in `mcp_audit_log`

For each test, audit log should show:
- One or more **read** MCP calls (catalog, availability, order lookup) before any factual reply.
- For Test 2: a `square_create_order` and a `kitchen_create_ticket` after the customer confirmed.
- For Tests 3 and 5: an escalation message posted to the owner bot.
- No fabricated MCP calls (every claim in the reply must trace to a real call).
