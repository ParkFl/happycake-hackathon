#!/usr/bin/env bash
# scripts/deploy.sh — deploy the HappyCake site to Vercel.
#
# Prerequisites (one-time):
#   1. Run `vercel login` in your terminal — opens browser for OAuth.
#   2. .env exists in the repo root with HAPPYCAKE_TEAM_TOKEN set.
#
# What this does:
#   - Confirms Vercel CLI is logged in
#   - Links the site/ directory to a Vercel project (creates if needed)
#   - Pushes HAPPYCAKE_TEAM_TOKEN to Vercel as a Production env var (idempotent)
#   - Builds + deploys to production
#   - Prints the production URL

set -e

set -a
# shellcheck disable=SC1091
. ./.env
set +a

export PATH="$PATH:/c/Program Files/nodejs:/c/Users/user/AppData/Local/Microsoft/WinGet/Links:/c/Users/user/AppData/Roaming/npm"

red()   { printf "\033[31m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
blue()  { printf "\033[34m%s\033[0m\n" "$1"; }

cd site

blue "[1/4] Confirming Vercel login…"
WHOAMI=$(vercel whoami 2>&1 || true)
if echo "$WHOAMI" | grep -qiE "not authenticated|please login"; then
  red "Not logged in. Run 'vercel login' in your terminal first, then re-run this script."
  exit 1
fi
green "  ✓ Logged in as: $WHOAMI"

blue "[2/4] Linking site/ to a Vercel project…"
if [ ! -f .vercel/project.json ]; then
  vercel link --yes --project happycake-us 2>&1 | tail -3
else
  green "  ✓ Already linked (.vercel/project.json present)."
fi

blue "[3/4] Setting HAPPYCAKE_TEAM_TOKEN + LOCAL_AGENT_URL as Production env vars…"
if [ -z "${HAPPYCAKE_TEAM_TOKEN:-}" ]; then
  red "HAPPYCAKE_TEAM_TOKEN is empty in .env. Aborting."
  exit 1
fi

# Helper: write value to a temp file, redirect from it.
# `echo $VAR | vercel env add` loses stdin on some Windows MSYS-bash setups —
# the file redirect is the only reliable way to feed the value.
push_env() {
  local name="$1" value="$2"
  local tmp
  tmp=$(mktemp)
  printf '%s' "$value" > "$tmp"
  vercel env rm "$name" production --yes 2>/dev/null || true
  vercel env add "$name" production < "$tmp" 2>&1 | tail -3
  rm -f "$tmp"
}

push_env HAPPYCAKE_TEAM_TOKEN "$HAPPYCAKE_TEAM_TOKEN"
green "  ✓ HAPPYCAKE_TEAM_TOKEN pushed."

# LOCAL_AGENT_URL = the public ngrok / Cloudflare URL pointing at owner_bot:8000.
# Without it, prod /api/chat falls back to the offline message and
# /api/chat/poll returns no live-owner messages — site chat becomes one-way.
if [ -n "${LOCAL_AGENT_URL:-}" ]; then
  push_env LOCAL_AGENT_URL "$LOCAL_AGENT_URL"
  green "  ✓ LOCAL_AGENT_URL pushed: $LOCAL_AGENT_URL"
elif [ -n "${PUBLIC_WEBHOOK_BASE:-}" ]; then
  push_env LOCAL_AGENT_URL "$PUBLIC_WEBHOOK_BASE"
  green "  ✓ LOCAL_AGENT_URL pushed (fell back to PUBLIC_WEBHOOK_BASE): $PUBLIC_WEBHOOK_BASE"
else
  yellow "  ! Neither LOCAL_AGENT_URL nor PUBLIC_WEBHOOK_BASE set in .env."
  yellow "    Site chat in prod will show the offline fallback until you add one."
fi

if [ -n "${SITE_CHAT_TOKEN:-}" ]; then
  push_env SITE_CHAT_TOKEN "$SITE_CHAT_TOKEN"
  green "  ✓ SITE_CHAT_TOKEN pushed."
fi

blue "[4/4] Building + deploying to production…"
URL=$(vercel deploy --prod --yes 2>&1 | tee /tmp/vercel-deploy.log | tail -1)
echo
green "=== Deploy complete ==="
echo "  Production URL: $URL"
echo "  Full deploy log: /tmp/vercel-deploy.log"
echo
echo "Next: paste this URL into README.md (replace 'happycake.us')"
