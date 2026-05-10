import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL?.replace(/\/$/, "");
const SITE_CHAT_TOKEN = process.env.SITE_CHAT_TOKEN ?? "";

/**
 * GET /api/chat/poll?session_id=...
 *
 * Browser polls this while a live-owner takeover is active. We forward to the
 * owner-bot's /site-chat/poll over the ngrok tunnel; that endpoint drains
 * the per-thread pending_outbound queue and returns it.
 *
 * In local dev (no LOCAL_AGENT_URL), we return an empty list — the live-owner
 * flow is owner-bot-mediated and only meaningful in proxied production.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sid = url.searchParams.get("session_id");
  if (!sid) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  if (!LOCAL_AGENT_URL) {
    return NextResponse.json({ messages: [], mode: "bot", live: false, session_id: sid });
  }

  try {
    const headers: Record<string, string> = {
      "ngrok-skip-browser-warning": "true",
    };
    if (SITE_CHAT_TOKEN) headers["x-site-chat-token"] = SITE_CHAT_TOKEN;

    const upstream = await fetch(
      `${LOCAL_AGENT_URL}/site-chat/poll?session_id=${encodeURIComponent(sid)}`,
      { headers, signal: AbortSignal.timeout(8000) },
    );
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return NextResponse.json({ messages: [], mode: "bot", live: false, session_id: sid }, { status: 200 });
    }
    return NextResponse.json(data);
  } catch {
    // Polling failures are silent — the next tick retries.
    return NextResponse.json({ messages: [], mode: "bot", live: false, session_id: sid }, { status: 200 });
  }
}
