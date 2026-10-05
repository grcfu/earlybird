import { NextRequest, NextResponse } from "next/server";
import {
  listApplications,
  deleteApplication,
  restoreApplication,
  setReferral,
  updateApplication,
  addStageEvent,
  deleteStageEvent,
  createManualApplication,
} from "@/lib/apptracker/store";
import { toStageKey } from "@/lib/apptracker/stages";

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

// A YYYY-MM-DD (or full ISO) date from the client, or null when it isn't one.
function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v.length === 10 ? `${v}T12:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);

// POST /api/applications { key, id, action } —
//   "restore"      from Trash
//   "referral"     { referral: boolean } — the hand-marked referral flag
//   "update"       { company?, role?, stage? } — hand corrections, pinned
//   "addStage"     { stage, date, note? } — a stage the tracker missed
//   "deleteStage"  { eventId } — remove a hand-added stage (id not needed)
//   "create"       { company, role?, stage, date } — an untracked application (id not needed)
export async function POST(req: NextRequest) {
  let body: {
    key?: string;
    id?: string;
    action?: string;
    referral?: boolean;
    company?: unknown;
    role?: unknown;
    stage?: unknown;
    date?: unknown;
    note?: unknown;
    eventId?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const key = (body.key ?? "").trim();
  const id = (body.id ?? "").trim();
  const bad = (error: string) =>
    NextResponse.json({ ok: false, error }, { status: 400 });

  if (key.length >= 16 && body.action === "create") {
    const company = str(body.company);
    const stage = toStageKey(str(body.stage));
    const date = parseDate(body.date) ?? new Date();
    if (!company) return bad("company is required");
    if (!stage) return bad("unknown stage");
    const newId = await createManualApplication(key, {
      company,
      role: str(body.role) ?? "",
      stage,
      date,
    });
    return NextResponse.json({ ok: true, id: newId });
  }
  if (key.length >= 16 && body.action === "deleteStage") {
    const eventId = str(body.eventId);
    if (!eventId) return bad("missing eventId");
    return NextResponse.json({ ok: await deleteStageEvent(key, eventId) });
  }

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
  if (body.action === "update") {
    const company = str(body.company);
    const role = str(body.role);
    const stage = body.stage === undefined ? undefined : toStageKey(str(body.stage));
    if (company === "") return bad("company can't be empty");
    if (stage === null) return bad("unknown stage");
    const newId = await updateApplication(key, id, { company, role, stage });
    return NextResponse.json({ ok: newId != null, id: newId });
  }
  if (body.action === "addStage") {
    const stage = toStageKey(str(body.stage));
    const date = parseDate(body.date);
    if (!stage) return bad("unknown stage");
    if (!date) return bad("invalid date");
    const added = await addStageEvent(key, id, { stage, date, note: str(body.note) });
    return NextResponse.json({ ok: added });
  }
  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
