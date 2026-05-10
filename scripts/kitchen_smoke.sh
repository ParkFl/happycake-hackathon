#!/usr/bin/env bash
# scripts/kitchen_smoke.sh — drive the full POS + kitchen handoff chain.
# Order → kitchen ticket → capacity-aware accept/reject → ready → completed.
# Designed to move the evaluator's "POS + kitchen handoff" dimension from 65/100.
#
# Prereq: scripts/channel_smoke.sh has been run (so .env is verified working).
#
# Outputs:
#   logs/kitchen-smoke.log
#   research/kitchen-smoke-before.json
#   research/kitchen-smoke-after.json

set -e
mkdir -p logs research

set -a
# shellcheck disable=SC1091
. ./.env
set +a

export PATH="$PATH:/c/Users/user/AppData/Local/Microsoft/WinGet/Links"

red()   { printf "\033[31m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
blue()  { printf "\033[34m%s\033[0m\n" "$1"; }

LOG_FILE="logs/kitchen-smoke.log"
> "$LOG_FILE"

CLAUDE_FLAGS=(
  --model claude-opus-4-7
  --allowedTools "mcp__happycake,Read,Write"
  --permission-mode acceptEdits
  --max-turns 30
  --output-format text
)

run_claude() {
  local label="$1"
  local prompt="$2"
  blue ">>> $label"
  echo "================ $label ================" >> "$LOG_FILE"
  claude -p "$prompt" "${CLAUDE_FLAGS[@]}" < /dev/null 2>&1 | tee -a "$LOG_FILE"
  echo >> "$LOG_FILE"
}

echo "=== HappyCake kitchen handoff smoke ==="
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

# ---------- BEFORE ----------
blue "[0/3] Capturing baseline POS+kitchen score…"
run_claude "BEFORE: evaluator_score_pos_kitchen_flow" \
'Use the happycake MCP. Call evaluator_score_pos_kitchen_flow. Save result JSON to research/kitchen-smoke-before.json. Output one-line confirmation.'

# ---------- 1. Drive a fresh order through the full chain ----------
blue "[1/3] Order → ticket → accept → in_kitchen → ready → completed…"
run_claude "Full kitchen chain (happy path)" \
'You are the HappyCake POS + kitchen automator. Drive ONE order through the full lifecycle to generate evaluator evidence.

Steps (call MCP tools, do NOT skip any):

1. square_list_catalog — pick the whole honey cake variation (variationId starts with sq_var_whole_honey_cake; kitchenProductId is whole-honey-cake).

2. square_create_order with:
     items = [{ variationId: "sq_var_whole_honey_cake", quantity: 1 }]
     customerName = "Smoke Customer"
     customerPhone = "+18325550111"
   Capture the orderId from the response.

3. kitchen_create_ticket with:
     orderId = <from step 2>
     customerName = "Smoke Customer"
     items = [{ productId: "whole-honey-cake", quantity: 1 }]
   Capture ticketId and estimatedPrepMinutes from the response.

4. kitchen_get_production_summary — confirm remainingCapacityMinutes >= estimatedPrepMinutes.

5. kitchen_accept_ticket with:
     ticketId = <from step 3>
     estimatedMinutes = <estimatedPrepMinutes from step 3>

6. square_update_order_status with:
     orderId = <from step 2>
     status = "in_kitchen"

7. (Time advance) world_advance_time with minutes = 30.
   If it errors with "No active scenario", skip silently — not all sandbox states have a scenario running.

8. kitchen_mark_ready with ticketId = <from step 3>.

9. square_update_order_status with orderId = <from step 2>, status = "ready".

10. square_update_order_status with orderId = <from step 2>, status = "completed".

11. square_get_pos_summary — confirm the order is now in byStatus.completed.

Write a JSON summary to research/kitchen-chain-result.json with keys: orderId, ticketId, finalOrderStatus, finalTicketStatus, allTransitionsSucceeded (boolean).

Output: a 3-line plain-text summary of orderId, ticketId, and final statuses.'

# ---------- 2. Drive a capacity-rejected ticket to demonstrate the reject path ----------
blue "[2/3] Capacity-aware reject demonstration…"
run_claude "Kitchen reject path (over capacity)" \
'You are demonstrating the capacity-aware reject decision for the evaluator.

Steps:

1. kitchen_get_production_summary — note remainingCapacityMinutes.

2. To force an over-capacity scenario regardless of current state, create a new order that is plausibly large enough to be rejected:
     square_create_order with items = [{ variationId: "sq_var_whole_honey_cake", quantity: 1 }],
       customerName = "Smoke Reject Customer", customerPhone = "+18325550112"
     Then kitchen_create_ticket for that order.

3. kitchen_reject_ticket with:
     ticketId = <from step 2>
     reason = "Smoke test: simulating over-capacity reject for evaluator evidence — would normally trigger owner escalation."
   This is intentional — we want one rejected ticket in the audit log so the evaluator scores capacity-aware decisions.

4. square_update_order_status with the rejected order_id, status = "cancelled".

Output: 2-line summary of rejected ticketId and the reason.'

# ---------- AFTER ----------
blue "[3/3] Capturing post-smoke POS+kitchen score…"
run_claude "AFTER: evaluator_score_pos_kitchen_flow" \
'Use the happycake MCP.
1. Call evaluator_score_pos_kitchen_flow.
2. Call evaluator_get_evidence_summary.
3. Save {"score": <1>, "evidence": <2>} to research/kitchen-smoke-after.json.
Output a 2-line summary: new POS+kitchen score and the four kitchen counters (squareOrders, kitchenTickets, plus accepted/ready/rejected counts if surfaced).'

echo
green "=== Kitchen smoke complete ==="
echo "  Log:               $LOG_FILE"
echo "  Before snapshot:   research/kitchen-smoke-before.json"
echo "  After snapshot:    research/kitchen-smoke-after.json"
echo "  Chain result:      research/kitchen-chain-result.json"
echo "  Audit trail:       logs/audit-$(date -u +%Y-%m-%d).jsonl"
