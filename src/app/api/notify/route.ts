import { NextRequest, NextResponse } from "next/server";
import { runNotifications } from "@/lib/notify";
import { isCronAuthorized } from "@/lib/cron-auth";

// pg driver adapter + channel SDKs need the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/notify — send pending notifications. Cron-triggered; guarded by
// CRON_SECRET (see lib/cron-auth). Vercel Cron calls this daily.
// ?force=1 bypasses daily-digest scheduling (manual "send now").
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  const summary = await runNotifications({ force });
  return NextResponse.json({ ok: true, summary });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
