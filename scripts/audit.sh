#!/usr/bin/env bash
# scripts/audit.sh — pre-submission self-audit
# Run before every push. Catches the things evaluators score down.

set -e
red()    { printf "\033[31m%s\033[0m\n" "$1"; }
green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }

FAIL=0

echo "=== HappyCake repo audit ==="

# --- 1. Secrets ---
echo "[1/6] Scanning for secrets…"
if grep -rEn "sbc_team_[a-f0-9]{20,}" --include="*.{md,ts,tsx,js,jsx,py,json,sh,yml,yaml,env,Makefile,txt,toml,html,cfg,ini}" . 2>/dev/null | grep -v ".env.example" | grep -v ".gitignore" | grep -v "scripts/audit.sh"; then
  red "✗ Real team token found in tracked files. STOP — never commit this."
  FAIL=1
else
  green "✓ No real team tokens in tracked files."
fi

if [ -f .env ] && grep -q ".env" .gitignore 2>/dev/null; then
  green "✓ .env is gitignored."
else
  yellow "! Make sure .env exists locally and is in .gitignore."
fi

# --- 2. Brand wordmark ---
echo "[2/6] Brand wordmark check (customer-facing files)…"
BAD_PATTERNS='Happy Cake|happy cake|HAPPYCAKE|HC[^a-zA-Z]|"HappyCake"'
# Allow in docs/brandbook.md (it teaches the rule), metadata.txt (asset manifest), and audit.sh itself.
if grep -rEn "$BAD_PATTERNS" \
   --include="*.{tsx,ts,jsx,js,md}" \
   --exclude-dir=node_modules \
   --exclude-dir=.next \
   site/ bots/ docs/on-site-assistant-test-script.md docs/demo-script.md README.md ARCHITECTURE.md MARKETING_PLAN.md 2>/dev/null \
   | grep -v "brandbook.md" | grep -v "audit.sh"; then
  red "✗ Wrong wordmark spelling found. Use 'HappyCake' (one word)."
  FAIL=1
else
  green "✓ Wordmark spelling clean."
fi

# --- 3. Cake-name format ---
echo "[3/6] Cake-name format check…"
if grep -rEn "(Honey|Napoleon|Tiramisu|Milk Maiden|Pistachio Roll) cake" \
   --include="*.{tsx,ts,jsx,js,md}" \
   --exclude-dir=node_modules \
   site/ bots/ docs/ README.md 2>/dev/null \
   | grep -v "brandbook.md"; then
  yellow "! Found '<Name> cake' pattern — should be 'cake \"<Name>\"'."
fi

# --- 4. Required deliverable files ---
echo "[4/6] Submission file checklist…"
for f in README.md ARCHITECTURE.md MARKETING_PLAN.md .env.example .gitignore docs/on-site-assistant-test-script.md docs/demo-script.md; do
  if [ -f "$f" ]; then green "  ✓ $f"; else red "  ✗ missing: $f"; FAIL=1; fi
done

# --- 5. README has the right sections ---
echo "[5/6] README contents…"
for section in "Setup" "Demo" "Architecture" "Telegram bots" "$500" "AI customer"; do
  if grep -qi "$section" README.md 2>/dev/null; then
    green "  ✓ README mentions: $section"
  else
    yellow "  ! README missing: $section"
  fi
done

# --- 6. Public repo? (heuristic) ---
echo "[6/6] Repo visibility hint…"
if [ -d .git ]; then
  REMOTE=$(git config --get remote.origin.url 2>/dev/null || echo "")
  if [ -n "$REMOTE" ]; then
    green "  remote: $REMOTE"
    yellow "  ! Verify on GitHub: repo must be PUBLIC before deadline."
  else
    yellow "  ! No git remote configured."
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  green "=== AUDIT PASSED ==="
  exit 0
else
  red "=== AUDIT FAILED — fix the above before pushing ==="
  exit 1
fi
