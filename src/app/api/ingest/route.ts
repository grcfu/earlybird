import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest";

// The pg driver adapter needs the Node.js runtime (not Edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ingest — run ingestion across all sources.
// (Phase 5 adds a cron-secret header check in front of this.)
export async function POST() {
  const results = await ingestAll();
  const totals = results.reduce(
    (acc, r) => {
      acc.created += r.created;
      acc.updated += r.updated;
      acc.failed += r.error ? 1 : 0;
      return acc;
    },
    { created: 0, updated: 0, failed: 0 },
  );
  return NextResponse.json({ ok: true, totals, results });
}

// Allow GET too, for convenient manual triggering in the browser during dev.
export async function GET() {
  return POST();
}
