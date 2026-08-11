import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readDocx } from "@/lib/resume/docx";
import { applyDocxEdits } from "@/lib/resume/docx-replace";
import { surfaceSkillsInDocx } from "@/lib/resume/skills";
import { exportFilename } from "@/lib/resume/company";
import { coerceResumeData, bulletTextById } from "@/lib/resume/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportBody {
  company?: unknown;
  // Accepted rewrites of existing bullets.
  edits?: unknown;
  // Accepted brand-new bullets.
  additions?: unknown;
  // Skills ticked on the Tailor screen.
  surfaced?: unknown;
}

function asEdits(v: unknown): { bulletId: string; text: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      return {
        bulletId: typeof o.bulletId === "string" ? o.bulletId : "",
        text: typeof o.text === "string" ? o.text : "",
      };
    })
    .filter((e) => e.bulletId !== "" && e.text !== "");
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v)
    ? v.map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
    : [];
}

// POST /api/resume/export → the tailored .docx as a download.
//
// The stored resume is read, edited in memory, and streamed back. Nothing is
// written: the base resume must survive any number of exports untouched, so a
// tailored copy exists only in the response body.
export async function POST(req: NextRequest) {
  const session = await auth().catch(() => null);
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json(
      { ok: false, error: "Sign in to use Resume Tailor." },
      { status: 401 },
    );
  }

  let body: ExportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const company = typeof body.company === "string" ? body.company.trim() : "";
  const edits = asEdits(body.edits);
  const additions = asStrings(body.additions);
  const surfaced = asStrings(body.surfaced);

  const row = await prisma.resume.findUnique({
    where: { userId: uid },
    select: { data: true, docx: true },
  });
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Import a resume first." },
      { status: 400 },
    );
  }

  const data = coerceResumeData(row.data);
  const source = Buffer.from(row.docx);

  let paragraphs;
  try {
    paragraphs = readDocx(source).paragraphs;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Stored .docx is unreadable.",
      },
      { status: 500 },
    );
  }

  // Only touch bullets this resume actually has. The client sends what the user
  // accepted, but the document is the authority on what exists.
  const known = bulletTextById(data);
  const replace = new Map<string, string>();
  for (const e of edits) {
    if (known.has(e.bulletId)) replace.set(e.bulletId, e.text);
  }

  // Skills reordering is folded into the same pass. It can only ever reorder an
  // existing list, never add to one, so it cannot misstate the candidate.
  for (const [id, text] of surfaceSkillsInDocx(paragraphs, data, surfaced)) {
    // A bullet edit for the same paragraph would be surprising, but if one
    // exists it wins — it is the thing the user explicitly approved.
    if (!replace.has(id)) replace.set(id, text);
  }

  // New bullets go after the last experience bullet, so they land inside the
  // experience section and inherit its list formatting. Without an anchor there
  // is nowhere safe to put them, so they're reported as skipped instead of
  // being dropped in silently at the end of the document.
  const experienceBulletIds = data.experience.flatMap((e) =>
    e.bullets.map((b) => b.id),
  );
  const anchor = experienceBulletIds[experienceBulletIds.length - 1];
  const insertAfter =
    anchor && additions.length > 0
      ? { id: anchor, texts: additions }
      : undefined;

  const result = applyDocxEdits(source, { replace, insertAfter });

  const filename = exportFilename(data.basics.name, company);
  // The report rides along in headers so the UI can tell the user what happened
  // to a download it cannot inspect.
  const notes: string[] = [];
  if (result.skipped.length > 0) {
    notes.push(`${result.skipped.length} edit(s) skipped`);
  }
  if (result.flattened.length > 0) {
    notes.push(
      `${result.flattened.length} bullet(s) lost inline bold/italic because the reworded text dropped the formatted words`,
    );
  }
  if (additions.length > 0 && !insertAfter) {
    notes.push(
      `${additions.length} new bullet(s) skipped — no experience bullet to attach them to`,
    );
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // RFC 5987 form as well, so a non-ASCII surname survives the trip.
      "content-disposition": `attachment; filename="${filename.replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "content-length": String(result.buffer.length),
      "x-resume-replaced": String(result.replaced.length),
      "x-resume-inserted": String(result.inserted),
      "x-resume-notes": notes.join("; "),
      "cache-control": "no-store",
    },
  });
}
