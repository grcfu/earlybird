import { NextRequest, NextResponse } from "next/server";
import { recordFeedApplication } from "@/lib/apptracker/store";
import { STAGE_ORDER, type AppStageKey } from "@/lib/apptracker/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/applications/feed { key, company, role, stage }
// Called when the user marks a listing applied/interview/offer/rejected on the
// internships feed, so it also shows up in the Applications tab (source "feed").
export async function POST(req: NextRequest) {
  let body: { key?: string; company?: string; role?: string; stage?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const key = (body.key ?? "").trim();
  const company = (body.company ?? "").trim();
  const stage = (body.stage ?? "").toUpperCase() as AppStageKey;
  if (key.length < 16 || !company) {
    return NextResponse.json({ ok: false, error: "missing key or company" }, { status: 400 });
  }
  if (!STAGE_ORDER.includes(stage)) {
    return NextResponse.json({ ok: false, error: "invalid stage" }, { status: 400 });
  }
  const result = await recordFeedApplication(key, {
    company,
    role: body.role ?? "",
    stage,
  });
  return NextResponse.json({ ok: true, result });
}
