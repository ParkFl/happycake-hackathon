#!/usr/bin/env bash
# scripts/channel_smoke.sh — drive WhatsApp + Instagram + Google Business
# end-to-end against the sandbox. Each channel: one inbound + one on-brand reply.
# Designed to move the evaluator's "channel response" dimension from 0/100.
#
# Outputs:
#   logs/channel-smoke.log              — concatenated transcripts
#   research/channel-smoke-before.json  — score snapshot before
#   research/channel-smoke-after.json   — score snapshot after
#   research/channel-evidence.json      — final counters

set -e
mkdir -p logs research

# Load .env so .mcp.json can interpolate ${HAPPYCAKE_TEAM_TOKEN}
set -a
# shellcheck disable=SC1091
. ./.env
set +a

# Make sure jq (winget install puts it here on Windows) is on PATH
export PATH="$PATH:/c/Users/user/AppData/Local/Microsoft/WinGet/Links"

red()   { printf "\033[31m%s\033[0m\n" "$1"; }
green() { printf "\033[32m%s\033[0m\n" "$1"; }
blue()  { printf "\033[34m%s\033[0m\n" "$1"; }

BRAND_PROMPT_FILE=".claude/system-prompts/happycake-brand.md"
LOG_FILE="logs/channel-smoke.log"
> "$LOG_FILE"

CLAUDE_FLAGS=(
  --model claude-opus-4-7
  --append-system-prompt-file "$BRAND_PROMPT_FILE"
  --allowedTools "mcp__happycake,Read,Write"
  --permission-mode acceptEdits
  --max-turns 12
  --output-format text
)

run_claude() {
  local label="$1"
  local prompt="$2"
  blue ">>> $label"
  echo "================ $label ================" >> "$LOG_FILE"
  # Run with stdin closed so claude doesn't wait for piped input.
  claude -p "$prompt" "${CLAUDE_FLAGS[@]}" < /dev/null 2>&1 | tee -a "$LOG_FILE"
  echo >> "$LOG_FILE"
}

echo "=== HappyCake channel response smoke ==="
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

# ---------- BEFORE snapshot ----------
blue "[0/4] Capturing baseline channel-response score…"
run_claude "BEFORE: evaluator_score_channel_response" \
'Use the happycake MCP. Call evaluator_score_channel_response with no arguments. Then call evaluator_get_evidence_summary. Write the combined JSON (object with keys "score" and "evidence") to research/channel-smoke-before.json. Output ONLY a one-line confirmation when done.'

# ---------- 1. WHATSAPP ----------
blue "[1/4] WhatsApp: simulate inbound + on-brand reply…"
run_claude "WhatsApp inbound + reply" \
'You are handling one inbound WhatsApp customer message for HappyCake.

Step 1 — Inject a synthetic inbound message:
  Call whatsapp_inject_inbound with:
    from = "+18325550199"
    message = "Hi! It is my mom 60th birthday on Saturday. What do you have for 8 people?"

Step 2 — Process the inbound through the /sales playbook:
  Read .claude/commands/sales.md to remind yourself of the contract.
  Build the JSON envelope yourself:
    {
      "channel": "whatsapp",
      "customer": { "id": "+18325550199", "name": "Maya", "handle": "+18325550199" },
      "transcript": [],
      "latest_message": "Hi! It is my mom 60th birthday on Saturday. What do you have for 8 people?"
    }

  Then act per the system prompt:
    - Classify intent (consultation).
    - Call square_list_catalog and kitchen_get_production_summary to ground facts.
    - Compose an on-brand reply per HappyCake voice (English, soft CTA, sign as a person).
    - **You MUST call whatsapp_send to actually deliver the reply** with:
        to = "+18325550199"
        message = <your reply text>
    - Then emit the /sales JSON envelope as your final output.

Step 3 — Call whatsapp_list_threads once to confirm the conversation now exists.

Output: just the /sales JSON envelope at the end, nothing else.'

# ---------- 2. INSTAGRAM ----------
blue "[2/4] Instagram: simulate inbound DM + on-brand reply…"
run_claude "Instagram DM inbound + reply" \
'You are handling one inbound Instagram DM for HappyCake.

Step 1 — Inject a synthetic inbound DM:
  Call instagram_inject_dm with:
    threadId = "ig_thread_smoke_001"
    from = "@maya_houston"
    message = "Do you have anything for an office of 12 people for Friday morning?"

Step 2 — Process per /sales playbook:
  Read .claude/commands/sales.md.
  Build envelope:
    {
      "channel": "instagram",
      "customer": { "id": "@maya_houston", "name": "Maya", "handle": "@maya_houston" },
      "transcript": [],
      "latest_message": "Do you have anything for an office of 12 people for Friday morning?"
    }

  Act per system prompt:
    - Classify intent (consultation, office order).
    - Call square_list_catalog and kitchen_get_production_summary.
    - Recommend the Office dessert box (it is the catalog item for offices).
    - Compose IG-DM-format reply (under 4 lines unless the customer asked for a guide).
    - **You MUST call instagram_send_dm to deliver the reply** with:
        threadId = "ig_thread_smoke_001"
        message = <your reply text>
    - Emit /sales JSON envelope.

Step 3 — Call instagram_list_dm_threads once to confirm.

Output: only the /sales JSON envelope.'

# ---------- 3. GOOGLE BUSINESS ----------
blue "[3/4] Google Business: list reviews + on-brand reply…"
run_claude "Google Business review reply" \
'You are handling Google Business review replies for HappyCake.

Step 1 — Pull current reviews:
  Call gb_list_reviews. Save the raw JSON to research/gb-reviews.json.

Step 2 — Pick ONE review to reply to. Prefer:
  - A negative or 1-3 star review (apologise, on-brand, no policy quoting, no blame).
  - If no reviews at all are returned: call gb_list_simulated_actions to confirm an empty state, then skip to Step 4 noting "no reviews to reply to".

Step 3 — For the chosen review, draft an on-brand reply per the brandbook negativity-handling rules:
  - Apologise on behalf of HappyCake (one word).
  - Concrete remedy when applicable.
  - Sign as a person (e.g. "— Saule, HappyCake team").
  - Soft CTA: "Order on the site at happycake.us or send a message on WhatsApp."

  Then call gb_simulate_reply with:
    reviewId = <the chosen reviewId>
    reply = <your draft reply text>

Step 4 — Output a one-paragraph summary: which review you replied to, the reply text, and any follow-up needed.'

# ---------- AFTER snapshot ----------
blue "[4/4] Capturing post-smoke channel-response score and evidence…"
run_claude "AFTER: evaluator_score_channel_response + evidence" \
'Use the happycake MCP.
1. Call evaluator_score_channel_response with no arguments.
2. Call evaluator_get_evidence_summary with no arguments.
3. Write a single JSON object {"score": <result of 1>, "evidence": <result of 2>} to research/channel-smoke-after.json.
4. Also save the evidence JSON alone to research/channel-evidence.json.
Output a 2-line summary: the new channel score and the four channel counters (whatsappInbound, whatsappOutbound, instagramActions, gbusinessReplies).'

echo
green "=== Channel smoke complete ==="
echo "  Log:               $LOG_FILE"
echo "  Before snapshot:   research/channel-smoke-before.json"
echo "  After snapshot:    research/channel-smoke-after.json"
echo "  Evidence counters: research/channel-evidence.json"
echo "  Audit trail:       logs/audit-$(date -u +%Y-%m-%d).jsonl"
