#!/usr/bin/env bash
# scripts/smoke.sh — end-to-end smoke test against the MCP sandbox
# Drives one public scenario from start to evidence summary.
# Runs as a single Claude session so scenario_id persists across calls.

set -e
mkdir -p logs research

echo "=== HappyCake smoke test ==="
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

CLAUDE_FLAGS=(
  --model claude-opus-4-7
  --allowedTools "Read,Write,Edit,Bash,mcp__happycake"
  --permission-mode acceptEdits
  --max-turns 50
  --output-format text
)

# Bot wrappers will inject the brand system prompt; the smoke test focuses on
# operational MCP behaviour, so we don't need it here.

echo "[1/2] Driving one full public scenario end-to-end…"
PROMPT=$(cat <<'EOF'
Use the happycake MCP to run a complete public-practice scenario:

1. Call world_start_scenario with a publicly available practice scenario. Capture the scenario_id.
2. Loop: call world_next_event. For each event:
   - If it's a customer message (whatsapp/instagram/site_chat), simulate a /sales handling: classify intent, call square_list_catalog if you need product facts, call kitchen_get_production_summary if you need capacity, and if the customer is ordering, call square_create_order with an idempotency key sha256(channel+phone+slug+pickup_at).
   - If it's a kitchen-side or marketing event, react appropriately via the corresponding MCP tool.
   - Log a one-line summary of what you did to research/event-N.txt for each event.
   - Stop the loop when world_next_event returns no more events, or after 15 events maximum.
3. Call evaluator_get_evidence_summary and save to research/evidence-smoke.json.
4. Call evaluator_score_world_scenario for the scenario_id and save to research/score-smoke.json.

Return a short markdown summary: scenario_id, events processed, orders created, escalations, final score (if available).
EOF
)

claude -p "$PROMPT" "${CLAUDE_FLAGS[@]}" 2>&1 | tee logs/smoke.log

echo "[2/2] Done."
echo
echo "=== Smoke complete ==="
echo "  Evidence:    research/evidence-smoke.json"
echo "  Score:       research/score-smoke.json"
echo "  Run log:     logs/smoke.log"
echo "  Audit log:   logs/audit-$(date -u +%Y-%m-%d).jsonl"
