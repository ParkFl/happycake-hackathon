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

blue "[3/4] Setting HAPPYCAKE_TEAM_TOKEN as a Production env var…"
if [ -z "${HAPPYCAKE_TEAM_TOKEN:-}" ]; then
  red "HAPPYCAKE_TEAM_TOKEN is empty in .env. Aborting."
  exit 1
fi
# vercel env add prompts; we feed the value via stdin and overwrite if it exists
vercel env rm HAPPYCAKE_TEAM_TOKEN production --yes 2>/dev/null || true
echo "$HAPPYCAKE_TEAM_TOKEN" | vercel env add HAPPYCAKE_TEAM_TOKEN production 2>&1 | tail -3
green "  ✓ Token pushed to Vercel (Production scope)."

blue "[4/4] Building + deploying to production…"
URL=$(vercel deploy --prod --yes 2>&1 | tee /tmp/vercel-deploy.log | tail -1)
echo
green "=== Deploy complete ==="
echo "  Production URL: $URL"
echo "  Full deploy log: /tmp/vercel-deploy.log"
echo
echo "Next: paste this URL into README.md (replace 'happycake.us')"
