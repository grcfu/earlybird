import { NextRequest, NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest";
import { isCronAuthorized } from "@/lib/cron-auth";

// The pg driver adapter needs the Node.js runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ingest — run ingestion across all sources. Cron-triggered; guarded
// by CRON_SECRET (see lib/cron-auth). Vercel Cron calls this daily.
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const summary = await ingestAll();
  return NextResponse.json({ ok: true, summary });
}

// Vercel Cron sends GET; also convenient for manual triggering in the browser.
export async function GET(req: NextRequest) {
  return POST(req);
}
