import { NextRequest, NextResponse } from "next/server";
import { runNotifications } from "@/lib/notify";

// pg driver adapter + channel SDKs need the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/notify — send pending notifications (cron-triggered).
// ?force=1 bypasses daily-digest scheduling (manual "send now").
// (Phase 5 adds a cron-secret header check in front of this.)
export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("force") === "1";
  const summary = await runNotifications({ force });
  return NextResponse.json({ ok: true, summary });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
