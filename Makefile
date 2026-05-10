.PHONY: help install verify dev smoke demo audit clean

help:
	@echo "HappyCake — make targets"
	@echo "  make install   Install all dependencies (site + bots)"
	@echo "  make verify    Verify runtime: claude CLI, .env, MCP reachable, hooks"
	@echo "  make dev       Run site + bots locally"
	@echo "  make smoke     Run end-to-end smoke test against MCP sandbox"
	@echo "  make demo      Run the 5-minute evaluator demo"
	@echo "  make audit     Lint repo: brand voice, secrets, MCP coverage"

install:
	cd site && npm install
	cd bots && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
	chmod +x .claude/scripts/*.sh .claude/hooks/*.sh scripts/*.sh
	@command -v claude >/dev/null 2>&1 || { echo "Claude Code CLI not installed. Run: npm install -g @anthropic-ai/claude-code"; exit 1; }
	@command -v jq >/dev/null 2>&1 || { echo "jq not installed. Install: apt install jq  (or brew install jq)"; exit 1; }
	@echo "✓ Install complete. Next: cp .env.example .env, fill HAPPYCAKE_TEAM_TOKEN, then 'make verify'."

verify:
	@bash scripts/verify.sh

dev:
	@echo "Starting site on :$${SITE_PORT:-3000} and webhook bots on :$${WEBHOOK_PORT:-8000}"
	@(cd site && npm run dev) & \
	(cd bots && . .venv/bin/activate && python -m wrappers.run_all) & \
	wait

smoke:
	@echo "→ Sanity: MCP reachable?"
	@claude -p "Use the happycake MCP. Call evaluator_get_evidence_summary and print the JSON." | tee logs/smoke-mcp.log
	@echo "→ Running public scenario end-to-end"
	@bash scripts/smoke.sh
	@echo "✓ Smoke complete. Evidence in research/evidence-*.json"

demo:
	@bash scripts/demo.sh

audit:
	@bash scripts/audit.sh

clean:
	rm -rf site/.next site/node_modules bots/.venv logs/*.log research/raw/*
