import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readDocx } from "@/lib/resume/docx";
import { coerceResumeData, allBulletIds } from "@/lib/resume/schema";
import type { Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;

async function userId(): Promise<string | null> {
  const session = await auth().catch(() => null);
  return session?.user?.id ?? null;
}

// GET /api/resume → the stored base resume, without the binary.
// The .docx bytes are megabytes of no use to the browser: nothing client-side
// reads them, and export re-reads them server-side. Sending them would just
// make the tab slow to open.
export async function GET() {
  const uid = await userId();
  if (!uid) {
    return NextResponse.json(
      { ok: false, error: "Sign in to use Resume Tailor." },
      { status: 401 },
    );
  }

  const row = await prisma.resume.findUnique({
    where: { userId: uid },
    select: { data: true, filename: true, updatedAt: true },
  });
  if (!row) return NextResponse.json({ ok: true, resume: null });

  return NextResponse.json({
    ok: true,
    resume: {
      data: coerceResumeData(row.data),
      filename: row.filename,
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}

// POST /api/resume  (multipart: file=<.docx>, data=<JSON>)
// Commits the reviewed JSON together with the original file. Both arrive in one
// request because they have to agree: the JSON's bullet ids are positions in
// THIS file, so storing one without the other would leave ids pointing into a
// document that no longer matches, and export would quietly replace nothing.
export async function POST(req: NextRequest) {
  const uid = await userId();
  if (!uid) {
    return NextResponse.json(
      { ok: false, error: "Sign in to use Resume Tailor." },
      { status: 401 },
    );
  }

  let file: File | null = null;
  let rawJson = "";
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    rawJson = String(form.get("data") ?? "");
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read the upload." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { ok: false, error: "The original .docx is missing. Re-import it." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "That .docx is larger than 2 MB." },
      { status: 413 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return NextResponse.json(
      { ok: false, error: "The edited resume wasn't valid JSON." },
      { status: 400 },
    );
  }
  const data = coerceResumeData(parsed);
  if (!data.basics.name) {
    // The export filename is built from the surname, so an empty name would
    // produce "_Resume_Acme.docx". Better to stop at save time.
    return NextResponse.json(
      { ok: false, error: "Add a name before saving — the export filename uses it." },
      { status: 400 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Re-derive the document's ids server-side and confirm the JSON's bullet ids
  // are a subset. This is the guard that keeps the two halves in step: without
  // it, editing the JSON in one tab and re-uploading a different .docx in
  // another would store a pair that can never export.
  let known: Set<string>;
  try {
    known = new Set(readDocx(buf).paragraphs.map((p) => p.id));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unreadable .docx." },
      { status: 400 },
    );
  }
  const orphans = allBulletIds(data).filter((id) => !known.has(id));
  if (orphans.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `${orphans.length} bullet${orphans.length === 1 ? "" : "s"} don't match this .docx. Re-import the file instead of editing bullet ids.`,
      },
      { status: 400 },
    );
  }

  const payload = data as unknown as Prisma.InputJsonValue;
  const saved = await prisma.resume.upsert({
    where: { userId: uid },
    create: { userId: uid, data: payload, docx: buf, filename: file.name },
    update: { data: payload, docx: buf, filename: file.name },
    select: { filename: true, updatedAt: true },
  });

  return NextResponse.json({
    ok: true,
    resume: {
      data,
      filename: saved.filename,
      updatedAt: saved.updatedAt.toISOString(),
    },
  });
}

// DELETE /api/resume → forget the stored resume and its binary.
export async function DELETE() {
  const uid = await userId();
  if (!uid) {
    return NextResponse.json(
      { ok: false, error: "Sign in to use Resume Tailor." },
      { status: 401 },
    );
  }
  await prisma.resume.deleteMany({ where: { userId: uid } });
  return NextResponse.json({ ok: true });
}
