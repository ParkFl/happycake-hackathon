"""
bots/shared/claude_runner.py — spawn `claude -p` for /sales and /owner turns.

Centralises the headless invocation pattern from CLAUDE.md so all bots talk to Claude
the same way. The brand system prompt is appended via --append-system-prompt; the
slash-command body is added to the prompt manually because /sales and /owner only
work in interactive mode (not -p).
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path
from typing import Any


CLAUDE_BIN = os.environ.get("CLAUDE_BIN", "claude")
MODEL = "claude-opus-4-7"
DEFAULT_TIMEOUT = 120.0  # seconds


def _repo_root() -> Path:
    """Walk up from this file to the repo root (where .claude/ lives)."""
    p = Path(__file__).resolve()
    for ancestor in [p.parent] + list(p.parents):
        if (ancestor / ".claude").is_dir():
            return ancestor
    return Path(os.getcwd())


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _extract_envelope(text: str) -> dict[str, Any]:
    """The agent's final output is JSON, sometimes inside ```json fences. Pull it out."""
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    candidate = fence.group(1) if fence else text
    obj = re.search(r"\{[\s\S]*\}", candidate)
    if not obj:
        return {}
    try:
        return json.loads(obj.group(0))
    except json.JSONDecodeError:
        return {}


async def run_claude(
    *,
    command_name: str,           # "sales" | "owner"
    envelope: dict[str, Any],
    extra_prompt: str = "",
    allowed_tools: str = "Read,mcp__happycake",
    max_turns: int = 12,
    timeout: float = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    """
    Run `claude -p` with the brand system prompt and the slash-command body
    appended. Returns the parsed JSON envelope from the agent's final output.

    Raises RuntimeError on subprocess failure or timeout.
    """
    root = _repo_root()
    brand = _read_text(root / ".claude" / "system-prompts" / "happycake-brand.md")
    cmd_body = _read_text(root / ".claude" / "commands" / f"{command_name}.md")

    if not cmd_body:
        raise RuntimeError(f"slash-command body not found: .claude/commands/{command_name}.md")

    prompt = (
        f"You are running the /{command_name} slash command. The command body follows; treat it as your contract.\n\n"
        f"--- BEGIN /{command_name} ---\n{cmd_body}\n--- END /{command_name} ---\n\n"
        f"{extra_prompt}\n\n"
        f"Envelope:\n{json.dumps(envelope, indent=2, ensure_ascii=False)}"
    )

    args = [
        CLAUDE_BIN, "-p", prompt,
        "--model", MODEL,
        "--allowedTools", allowed_tools,
        "--permission-mode", "acceptEdits",
        "--max-turns", str(max_turns),
        "--output-format", "text",
    ]
    if brand:
        args.extend(["--append-system-prompt", brand])

    env = {**os.environ, "MCP_TIMEOUT": "15000"}
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        cwd=str(root),
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError(f"claude -p /{command_name} timed out after {timeout}s")

    if proc.returncode != 0:
        raise RuntimeError(
            f"claude -p /{command_name} exited {proc.returncode}: {stderr.decode('utf-8', errors='replace')[:400]}"
        )

    out = stdout.decode("utf-8", errors="replace")
    env_out = _extract_envelope(out)
    if not env_out:
        # Surface the raw text so the bot can show it to the owner instead of swallowing.
        return {"reply_text": out.strip(), "intent": "raw_text", "actions_taken": []}
    return env_out
