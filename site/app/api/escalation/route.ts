import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";

/**
 * Receives an escalation from any conversion flow (custom order, office over-capacity,
 * complaint, chat handoff, etc.) and:
 *   1. Writes it to a local logs/escalations-*.jsonl file (best-effort; on Vercel
 *      this is /tmp and ephemeral, so we don't rely on it).
 *   2. Forwards it to the operator's owner_bot via LOCAL_AGENT_URL so the team
 *      gets a Telegram alert with Approve/Reject buttons. This is the path that
 *      actually reaches a human.
 */
const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL?.replace(/\/$/, "");
const SITE_CHAT_TOKEN = process.env.SITE_CHAT_TOKEN ?? "";

export async function POST(req: Request) {
  let item: Record<string, unknown> = {};
  try {
    item = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const ts = new Date().toISOString();
  const id = `esc_${Date.now().toString(36)}`;
  const record = { id, ts, ...item };

  // Local file (best-effort).
  try {
    const dir = process.env.ESCALATION_DIR ?? path.join(process.cwd(), "..", "logs");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `escalations-${ts.slice(0, 10)}.jsonl`);
    await fs.appendFile(file, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("escalation file write failed", err);
  }

  // Forward to the operator's bot — this is what actually pings Telegram.
  let forwarded: { ok: boolean; id?: string; status?: number } = { ok: false };
  if (LOCAL_AGENT_URL) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      };
      if (SITE_CHAT_TOKEN) headers["x-site-chat-token"] = SITE_CHAT_TOKEN;
      const r = await fetch(`${LOCAL_AGENT_URL}/escalations`, {
        method: "POST",
        headers,
        body: JSON.stringify(record),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await r.json().catch(() => ({}));
      forwarded = { ok: r.ok, id: data?.id, status: r.status };
    } catch (err) {
      console.error("escalation forward to owner_bot failed", err);
    }
  }

  return NextResponse.json({ ok: true, id, ts, forwarded });
}
