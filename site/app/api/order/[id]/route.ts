import { NextResponse } from "next/server";
import { getPosSummary } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  // Sandbox doesn't expose a per-order lookup; the closest is the POS summary.
  // We return what we can without inventing fields.
  try {
    const summary = await getPosSummary();
    return NextResponse.json({
      orderId: params.id,
      pos_summary: summary,
      note: "Per-order lookup is provided via the assistant chat; the sandbox does not expose a single-order GET.",
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
