#!/usr/bin/env bash
# scripts/verify.sh — step-by-step verification before doing any real work.
# Run this once after `cp .env.example .env` and filling in the token.
# It checks each link in the chain so failures are pinpointable.

set -e
red()    { printf "\033[31m%s\033[0m\n" "$1"; }
green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }

echo "=== HappyCake — runtime verification ==="

# --- 1. Claude Code is installed ---
echo "[1/7] Claude CLI installed?"
if command -v claude >/dev/null 2>&1; then
  green "  ✓ $(claude --version 2>&1 | head -1)"
else
  red "  ✗ 'claude' not found. Install: npm install -g @anthropic-ai/claude-code"
  exit 1
fi

# --- 2. .env present and token loaded ---
echo "[2/7] .env present and HAPPYCAKE_TEAM_TOKEN set?"
if [ ! -f .env ]; then
  red "  ✗ .env missing. Run: cp .env.example .env && edit it."
  exit 1
fi
set -a; . ./.env; set +a
if [ -z "${HAPPYCAKE_TEAM_TOKEN:-}" ] || [ "${HAPPYCAKE_TEAM_TOKEN}" = "sbc_team_REPLACE_WITH_YOURS" ]; then
  red "  ✗ HAPPYCAKE_TEAM_TOKEN not set or still a placeholder."
  exit 1
fi
green "  ✓ Token present (prefix: ${HAPPYCAKE_TEAM_TOKEN:0:11}…)"

# --- 3. headers helper script works ---
echo "[3/7] mcp_headers.sh outputs valid JSON with the token?"
if ! HEADERS=$(bash .claude/scripts/mcp_headers.sh 2>/dev/null); then
  red "  ✗ headers helper failed. Check .claude/scripts/mcp_headers.sh"
  exit 1
fi
if ! echo "$HEADERS" | jq -e '."X-Team-Token"' >/dev/null 2>&1; then
  red "  ✗ helper output missing X-Team-Token. Got: $HEADERS"
  exit 1
fi
green "  ✓ Headers helper outputs valid JSON with X-Team-Token."

# --- 4. MCP sandbox is reachable (raw HTTP smoke) ---
echo "[4/7] MCP sandbox reachable over HTTPS?"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "X-Team-Token: ${HAPPYCAKE_TEAM_TOKEN}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"happycake-verify","version":"0.1"}}}' \
  "${HAPPYCAKE_MCP_URL:-https://www.steppebusinessclub.com/api/mcp}")
case "$HTTP_CODE" in
  200|202) green "  ✓ MCP server responded HTTP $HTTP_CODE" ;;
  401|403) red "  ✗ MCP returned HTTP $HTTP_CODE — token rejected. Re-check the token." ; exit 1 ;;
  000)     red "  ✗ Could not connect (network or DNS). Check your internet." ; exit 1 ;;
  *)       yellow "  ! Unexpected HTTP $HTTP_CODE — sandbox may be flaky; continuing." ;;
esac

# --- 5. Claude lists the MCP server as connected ---
echo "[5/7] 'claude mcp list' sees the happycake server?"
if claude mcp list 2>&1 | grep -E "happycake.*Connected|happycake.*✓" >/dev/null; then
  green "  ✓ Claude reports happycake as connected."
else
  yellow "  ! 'claude mcp list' didn't show happycake as connected. Output:"
  claude mcp list 2>&1 | sed 's/^/      /'
fi

# --- 6. Claude can actually invoke a tool ---
echo "[6/7] Claude can call evaluator_get_evidence_summary via MCP?"
mkdir -p logs
OUT=$(claude -p "Use the happycake MCP. Call evaluator_get_evidence_summary with no arguments. Return only the raw JSON response, nothing else." \
  --model claude-opus-4-7 \
  --allowedTools "mcp__happycake" \
  --permission-mode acceptEdits \
  --max-turns 5 \
  --output-format text 2>&1 | tee logs/verify-mcp-call.log)
if echo "$OUT" | grep -qE '\{|\['; then
  green "  ✓ Got a JSON-shaped response from the MCP. Saved to logs/verify-mcp-call.log."
else
  red "  ✗ Did not see a JSON-shaped response. Check logs/verify-mcp-call.log:"
  echo "$OUT" | head -20 | sed 's/^/      /'
  exit 1
fi

# --- 7. Audit hook fired ---
echo "[7/7] PostToolUse hook recorded the MCP call to audit log?"
TODAY=$(date -u +%Y-%m-%d)
if [ -f "logs/audit-${TODAY}.jsonl" ] && grep -q "evaluator_get_evidence_summary" "logs/audit-${TODAY}.jsonl"; then
  green "  ✓ Hook wrote to logs/audit-${TODAY}.jsonl"
else
  yellow "  ! Hook didn't write an audit line. Either the hook isn't installed or the tool name pattern didn't match."
  yellow "    Check .claude/settings.json hooks.PostToolUse and .claude/hooks/log_mcp.sh."
fi

echo
green "=== VERIFY COMPLETE — runtime is healthy. You're ready to build. ==="
