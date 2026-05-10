# Sandbox & MCP — quick reference

Consolidated from the four overlapping sandbox/runtime info files in the original brief pack. Read this together with `HACKATHON_BRIEF.md` (canonical brief) and `brandbook.md`. The actual team token is in `.env` only — never in tracked files.

## Endpoint

- MCP base URL: `https://www.steppebusinessclub.com/api/mcp`
- Transport: HTTP (streamable JSON-RPC over POST)
- Auth: `X-Team-Token` header per request
- Token lives in `.env` as `HAPPYCAKE_TEAM_TOKEN`. Loaded into MCP requests by `.claude/scripts/mcp_headers.sh` (workaround for issue #51581 where `${VAR}` substitution in `.mcp.json` headers is broken).

## Per-team isolation

State, actions, audit log, campaigns, and orders are scoped by token. Each team operates in its own digital twin of the business. There is no cross-team contamination, but there is also no real-customer fallback.

## What the sandbox simulates

| Module | What it covers |
|---|---|
| Square / POS | Catalog, inventory, orders, sales CSV, margins |
| Kitchen / Production | Queue, capacity, lead times, accept/reject decisions, ready-for-pickup states |
| WhatsApp | Inbound customer threads, outbound replies, webhooks |
| Instagram | DMs, comments, post drafts, scheduled posts, audience response |
| Google Business | Reviews, local metrics, posts, Q&A |
| Marketing | Campaigns, allocation of $500/mo, leads, ROAS, owner reports |
| World / Scenarios | Deterministic events the evaluator drives — public scenarios for practice, secret scenarios at judging time |
| Evaluator | Audit log, evidence summaries, scoring of world scenarios, per-team reports |

## MCP tool inventory by use case

```
catalog & POS              square_list_catalog
                           square_get_pos_summary
                           square_create_order            (idempotent — pass key)
                           square_update_order_status

kitchen handoff            kitchen_create_ticket
                           kitchen_accept_ticket
                           kitchen_reject_ticket
                           kitchen_get_production_summary

marketing closed loop      marketing_create_campaign
                           marketing_launch_simulated_campaign
                           marketing_generate_leads
                           marketing_report_to_owner

world / scenarios          world_start_scenario
                           world_next_event
                           world_advance_time
                           world_get_scenario_summary

evaluator evidence         evaluator_get_evidence_summary
                           evaluator_score_world_scenario
                           evaluator_generate_team_report
```

The complete list of tool names and arg shapes is discoverable at runtime — call each tool with empty/minimal args and inspect the response. Save raw responses to `research/<tool>.json` so the agent doesn't have to re-discover schemas.

## Compressed time

Scenarios can simulate hours or weeks of customer demand within a single 24-hour event. `world_advance_time` jumps the clock; `world_next_event` pulls the next deterministic event from the queue. The same scenario replayed produces the same events — that's how the evaluator scores deterministically.

## What "no real credentials" means

Teams never receive Askhat's real Instagram, WhatsApp, Google Business, Square, or Vercel credentials. The post-hackathon production step is to swap each MCP-backed adapter for a real API client; the hackathon proves the *interface* works, not the production integration. Keep adapter signatures stable so the swap is mechanical.

## Submission checklist (mirrors the brief, kept here for the agent)

- [ ] Public Git repo
- [ ] README with fresh-clone setup instructions
- [ ] ARCHITECTURE.md — agents, routing, MCP usage, owner-bot mapping
- [ ] `.env.example` with placeholders only
- [ ] Site/storefront build instructions and deploy notes
- [ ] On-site assistant test script (`docs/on-site-assistant-test-script.md`)
- [ ] Documented marketing, channel, POS, kitchen scenarios with expected behaviour
- [ ] Evidence of test runs / smoke checks / staged demos
- [ ] Production-handoff path for real adapters after the hackathon

## Judging usage of the sandbox

The evaluator clones the submitted repo, stands up the stack via README, drives public and secret scenarios through MCP and customer channels, then inspects `mcp_audit_log` and `mcp_simulation_state` for evidence of behaviour. Score targets:

- Website as deployable `happycake.us` candidate
- Agent-friendliness: can an AI customer read the site, understand constraints, reach order intent?
- On-site assistant behaviour: consultation, custom orders, complaints, status checks, escalation — with MCP evidence
- Marketing as a closed loop: plan → launch sim → leads → conversion → metrics → adjustment
- Safety, owner approval, production-handoff readiness

The verdict is final; there is no appeals process.
