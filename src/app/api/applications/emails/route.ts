import { NextRequest, NextResponse } from "next/server";
import { listApplicationEmails } from "@/lib/apptracker/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/applications/emails?key=...&id=... — full email history for one app.
export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim();
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (key.length < 16 || !id) {
    return NextResponse.json(
      { ok: false, error: "missing key or id" },
      { status: 400 },
    );
  }
  const emails = await listApplicationEmails(key, id);
  return NextResponse.json({ ok: true, emails });
}
