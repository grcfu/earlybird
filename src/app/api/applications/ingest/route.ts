import { NextRequest, NextResponse } from "next/server";
import { classifyEmail } from "@/lib/apptracker/classify";
import { recordApplication } from "@/lib/apptracker/store";

// pg driver adapter requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/applications/ingest
// Called by the user's Gmail Apps Script, once per job email.
// Body: { key, subject, body, from?, receivedAt? }
// The `key` is the user's secret tracker key — it's both auth and identity.
export async function POST(req: NextRequest) {
  let payload: {
    key?: string;
    subject?: string;
    body?: string;
    from?: string;
    receivedAt?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const key = (payload.key ?? "").trim();
  // Basic sanity on the key so junk requests don't create orphan rows.
  if (key.length < 16) {
    return NextResponse.json(
      { ok: false, error: "missing or too-short key" },
      { status: 401 },
    );
  }

  const classification = classifyEmail({
    subject: payload.subject ?? "",
    body: payload.body ?? "",
    from: payload.from,
    receivedAt: payload.receivedAt,
  });

  const result = await recordApplication(
    key,
    classification,
    payload.subject ?? "",
  );

  return NextResponse.json({ ok: true, classification, result });
}
