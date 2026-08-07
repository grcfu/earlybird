import { NextRequest, NextResponse } from "next/server";
import {
  listApplications,
  deleteApplication,
  restoreApplication,
  setReferral,
} from "@/lib/apptracker/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/applications?key=... — the caller's tracked applications (incl. Trash).
export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim();
  if (key.length < 16) {
    return NextResponse.json({ ok: false, error: "missing key" }, { status: 401 });
  }
  const applications = await listApplications(key);
  return NextResponse.json({ ok: true, applications });
}

// DELETE /api/applications?key=...&id=... — soft delete (moves to Trash).
export async function DELETE(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim();
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (key.length < 16 || !id) {
    return NextResponse.json(
      { ok: false, error: "missing key or id" },
      { status: 400 },
    );
  }
  const deleted = await deleteApplication(key, id);
  return NextResponse.json({ ok: deleted });
}

// POST /api/applications { key, id, action } — "restore" from Trash, or
// "referral" with { referral: boolean } to set the hand-marked referral flag.
export async function POST(req: NextRequest) {
  let body: { key?: string; id?: string; action?: string; referral?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const key = (body.key ?? "").trim();
  const id = (body.id ?? "").trim();
  if (key.length < 16 || !id) {
    return NextResponse.json(
      { ok: false, error: "missing key or id" },
      { status: 400 },
    );
  }
  if (body.action === "restore") {
    const restored = await restoreApplication(key, id);
    return NextResponse.json({ ok: restored });
  }
  if (body.action === "referral") {
    const set = await setReferral(key, id, body.referral === true);
    return NextResponse.json({ ok: set });
  }
  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
