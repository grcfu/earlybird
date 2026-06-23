import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest";

// The pg driver adapter needs the Node.js runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ingest — run ingestion across all sources.
// (Phase 5 adds a cron-secret header check in front of this.)
export async function POST() {
  const summary = await ingestAll();
  return NextResponse.json({ ok: true, summary });
}

// Allow GET too, for convenient manual triggering in the browser during dev.
export async function GET() {
  return POST();
}
