import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 120;

type ChatTurn = { role: "customer" | "agent"; text: string };
type ChatRequest = {
  channel: "site_chat" | "whatsapp" | "instagram";
  page_context?: { current_product_slug?: string };
  transcript?: ChatTurn[];
  latest_message: string;
};

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const MODEL = "claude-opus-4-7";
const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL?.replace(/\/$/, ""); // strip trailing slash
const SITE_CHAT_TOKEN = process.env.SITE_CHAT_TOKEN ?? "";
const REAL_PHONE = "(281) 979-8320";
const FALLBACK_REPLY =
  `We're briefly offline on the chat. Reach the shop at ${REAL_PHONE}, or DM @happycake.us on Instagram, and we'll get right back to you. — the HappyCake team`;

/**
 * In production (Vercel), `claude -p` is not available — there's no Claude Code CLI
 * in the serverless runtime. Instead, we proxy to the operator's local agent server
 * (bots/site_chat_server.py) exposed via ngrok / Cloudflare Tunnel as LOCAL_AGENT_URL.
 *
 * In local dev, we spawn `claude -p` directly.
 */
const SHOULD_PROXY = !!LOCAL_AGENT_URL;

async function readBrandPrompt(): Promise<string> {
  const candidates = [
    path.resolve(process.cwd(), "..", ".claude", "system-prompts", "happycake-brand.md"),
    path.resolve(process.cwd(), ".claude", "system-prompts", "happycake-brand.md"),
  ];
  for (const c of candidates) {
    try { return await fs.readFile(c, "utf8"); } catch { /* try next */ }
  }
  return "";
}

function spawnClaude(envelope: ChatRequest, brand: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const promptBody =
      `You are handling one inbound site-chat message from a HappyCake customer. ` +
      `Follow the /sales contract in .claude/commands/sales.md (read it first), ` +
      `ground every fact in MCP, and emit the JSON envelope as your final output.\n\n` +
      `Envelope:\n${JSON.stringify(envelope, null, 2)}`;

    const args = [
      "-p", promptBody,
      "--model", MODEL,
      "--allowedTools", "Read,mcp__happycake",
      "--permission-mode", "acceptEdits",
      "--max-turns", "12",
      "--output-format", "text",
    ];
    if (brand) args.push("--append-system-prompt", brand);

    const child = spawn(CLAUDE_BIN, args, {
      env: { ...process.env, MCP_TIMEOUT: "15000" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => { out += b.toString(); });
    child.stderr.on("data", (b) => { err += b.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`claude exit ${code}: ${err.slice(0, 500)}`));
    });
  });
}

function extractEnvelope(text: string): { reply_text?: string; intent?: string } {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const m = candidate.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try { return JSON.parse(m[0]); } catch { return {}; }
}

export async function POST(req: Request) {
  let payload: ChatRequest;
  try {
    payload = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!payload.latest_message?.trim()) {
    return NextResponse.json({ error: "latest_message is required" }, { status: 400 });
  }

  // ---------------- PRODUCTION (Vercel): proxy to LOCAL_AGENT_URL ----------------
  if (SHOULD_PROXY) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        // Skip ngrok free-tier interstitial that would otherwise return HTML, not JSON.
        "ngrok-skip-browser-warning": "true",
      };
      if (SITE_CHAT_TOKEN) headers["x-site-chat-token"] = SITE_CHAT_TOKEN;

      const upstream = await fetch(`${LOCAL_AGENT_URL}/site-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        // Vercel route can run up to 120s; tunnel adds ~1-3s; cap below that.
        signal: AbortSignal.timeout(110_000),
      });

      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        return NextResponse.json({
          reply_text: data.reply_text ?? FALLBACK_REPLY,
          intent: data.intent ?? "agent_error",
          upstream_status: upstream.status,
        }, { status: upstream.status >= 500 ? 502 : upstream.status });
      }
      return NextResponse.json(data);
    } catch (err) {
      const msg = (err as Error).message;
      const isAbort = msg.includes("timeout") || msg.includes("AbortError");
      return NextResponse.json({
        reply_text: FALLBACK_REPLY,
        intent: isAbort ? "agent_timeout" : "agent_error",
        error: msg,
      }, { status: 502 });
    }
  }

  // ---------------- LOCAL DEV: spawn claude -p directly ----------------
  try {
    const brand = await readBrandPrompt();
    const raw = await spawnClaude(payload, brand);
    const env = extractEnvelope(raw);
    return NextResponse.json({
      reply_text: env.reply_text ?? FALLBACK_REPLY,
      intent: env.intent ?? "unknown",
    });
  } catch (err) {
    return NextResponse.json({
      reply_text: FALLBACK_REPLY,
      intent: "agent_error",
      error: (err as Error).message,
    }, { status: 502 });
  }
}
