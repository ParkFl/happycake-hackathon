#!/usr/bin/env bash
# .claude/scripts/mcp_headers.sh
# Workaround for Claude Code issue #51581 — ${VAR} expansion in
# .mcp.json `headers` is broken for HTTP transport. headersHelper executes
# this script and uses its stdout (a JSON object) as the headers map.

# Source .env if present, so we don't depend on the parent shell exporting it.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${HAPPYCAKE_TEAM_TOKEN:-}" ]; then
  echo "{}" 
  echo "ERROR: HAPPYCAKE_TEAM_TOKEN is not set. Put it in .env (see .env.example)." >&2
  exit 1
fi

cat <<EOF
{
  "X-Team-Token": "${HAPPYCAKE_TEAM_TOKEN}"
}
EOF
