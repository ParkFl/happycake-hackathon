#!/usr/bin/env bash
# .claude/hooks/log_mcp.sh
# PostToolUse hook fired after every mcp__happycake__* call.
# Hook receives JSON on stdin describing the tool invocation; we append
# one structured line to logs/audit-YYYY-MM-DD.jsonl for the evidence trail.

set -e
mkdir -p logs
DATE=$(date -u +%Y-%m-%d)
TS=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
LOGFILE="logs/audit-${DATE}.jsonl"

# Read the hook's stdin payload (Claude Code passes a JSON event).
PAYLOAD=$(cat)

# Extract tool name and a short result summary (jq is required; install via apt if missing).
TOOL=$(echo "$PAYLOAD" | jq -r '.tool_name // .tool // "unknown"' 2>/dev/null || echo "unknown")
ARGS=$(echo "$PAYLOAD" | jq -c '.tool_input // .input // {}' 2>/dev/null || echo "{}")
RESULT_LEN=$(echo "$PAYLOAD" | jq -r '(.tool_response // .response // "" | tostring | length)' 2>/dev/null || echo "0")
SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // ""' 2>/dev/null || echo "")

# Append the audit line.
jq -nc \
  --arg ts "$TS" \
  --arg tool "$TOOL" \
  --argjson args "$ARGS" \
  --argjson result_len "$RESULT_LEN" \
  --arg session "$SESSION_ID" \
  '{ts: $ts, kind: "mcp_call", tool: $tool, args: $args, result_chars: $result_len, session: $session}' \
  >> "$LOGFILE"

# Always exit 0 so we never block the agent.
exit 0
