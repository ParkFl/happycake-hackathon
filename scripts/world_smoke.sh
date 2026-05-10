#!/usr/bin/env bash
# scripts/world_smoke.sh — start a public-practice world scenario, drive events,
# react via the same MCP wrappers used elsewhere. Moves "world scenario execution"
# dimension from 40/100.
#
# Outputs:
#   logs/world-smoke.log
#   research/world-scenarios.json
#   research/world-smoke-before.json
#   research/world-smoke-after.json

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

LOG_FILE="logs/world-smoke.log"
> "$LOG_FILE"

CLAUDE_FLAGS=(
  --model claude-opus-4-7
  --append-system-prompt-file ".claude/system-prompts/happycake-brand.md"
  --allowedTools "mcp__happycake,Read,Write"
  --permission-mode acceptEdits
  --max-turns 40
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

echo "=== HappyCake world scenario smoke ==="
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

# ---------- BEFORE ----------
blue "[0/3] Capturing baseline world score…"
run_claude "BEFORE: evaluator_score_world_scenario" \
'Use the happycake MCP. Call evaluator_score_world_scenario, save JSON to research/world-smoke-before.json. Output one-line confirmation.'

# ---------- 1. Discover available scenarios + start one ----------
blue "[1/3] Discover scenarios + start one + drive events…"
run_claude "World scenario: discover, start, drive events" \
'You are running a public-practice world scenario for HappyCake.

Step 1 — Discover available scenarios:
  Call world_get_scenarios. Save the response JSON to research/world-scenarios.json.
  Pick one scenario suitable for public practice (look for tags like "public", "practice", "demo", or just the first non-secret one). Capture its id.

Step 2 — Start the scenario:
  Call world_start_scenario with scenarioId = <picked id>.

Step 3 — Read the timeline upfront for context:
  Call world_get_timeline. Note the planned events.

Step 4 — Loop, up to 12 iterations:
  - Call world_next_event.
  - If it returns no event (or an "ended"/"completed" status), stop the loop.
  - For each event:
      * If it is a customer message on whatsapp/instagram, react by calling the appropriate channel send tool with an on-brand reply, after grounding any facts via square_list_catalog and kitchen_get_production_summary.
      * If it is a kitchen-side event, react via the appropriate kitchen tool (accept/reject/mark_ready).
      * If it is a marketing-side event (e.g. a lead), call marketing_route_lead.
      * If it is a Google Business event, react via gb_simulate_reply or gb_simulate_post.
      * For any other event type, log "no-op for event type X".
  - After each event call world_advance_time with minutes = 5 to keep the timeline progressing.

Step 5 — Call world_get_scenario_summary, write the result to research/world-final-state.json.

Output: a markdown bullet list — scenarioId chosen, number of events processed, number of MCP reactions taken, final summary status.'

# ---------- AFTER ----------
blue "[2/3] Capturing post-smoke world score…"
run_claude "AFTER: evaluator_score_world_scenario + evidence" \
'Use the happycake MCP.
1. Call evaluator_score_world_scenario.
2. Call evaluator_get_evidence_summary.
3. Save {"score": <1>, "evidence": <2>} to research/world-smoke-after.json.
Output a 2-line summary: new world score and worldEvents + auditCalls counters.'

# ---------- Final team report ----------
blue "[3/3] Final team report after world smoke…"
run_claude "Final team report" \
'Use the happycake MCP. Call evaluator_generate_team_report. Save to research/team-report-after-world.json. Output a 1-line summary: total score / 100, plus per-dimension scores in the form "marketing=X pos=Y channel=Z world=W".'

echo
green "=== World smoke complete ==="
echo "  Log:               $LOG_FILE"
echo "  Scenarios:         research/world-scenarios.json"
echo "  Before snapshot:   research/world-smoke-before.json"
echo "  After snapshot:    research/world-smoke-after.json"
echo "  Final state:       research/world-final-state.json"
echo "  Team report:       research/team-report-after-world.json"
echo "  Audit trail:       logs/audit-$(date -u +%Y-%m-%d).jsonl"
