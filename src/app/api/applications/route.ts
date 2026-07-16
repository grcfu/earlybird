import { NextRequest, NextResponse } from "next/server";
import { listApplications, deleteApplication } from "@/lib/apptracker/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/applications?key=... — the caller's tracked applications.
export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") ?? "").trim();
  if (key.length < 16) {
    return NextResponse.json({ ok: false, error: "missing key" }, { status: 401 });
  }
  const applications = await listApplications(key);
  return NextResponse.json({ ok: true, applications });
}

// DELETE /api/applications?key=...&id=... — remove one (e.g. a mis-parsed row).
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
