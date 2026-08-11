import { NextRequest, NextResponse } from "next/server";
import mammoth from "mammoth";
import { auth } from "@/auth";
import { readDocx } from "@/lib/resume/docx";
import { generateJson, GeminiError } from "@/lib/resume/gemini";
import { reserveGeminiCall, quotaMessage } from "@/lib/resume/quota";
import {
  RESUME_RESPONSE_SCHEMA,
  coerceResumeData,
  allBulletIds,
  type ResumeData,
} from "@/lib/resume/schema";

// pizzip and mammoth both need Buffer.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A thinking model reading a whole resume regularly takes 10-20s.
export const maxDuration = 60;

// A resume is tens of KB. This is far below Vercel's 4.5 MB body cap and exists
// to reject a wrong file early with a message that says what happened.
const MAX_BYTES = 2 * 1024 * 1024;

const SYSTEM = `You convert a resume into structured JSON. You are a parser, not an editor.

Rules:
- Transcribe what the document says. Never invent, improve, summarize or reword.
- Every line of the document arrives prefixed with an id in brackets: "[p7] text".
- For each bullet you emit, set "id" to that line's id EXACTLY, and "text" to the
  line's text WITHOUT the bracket prefix. Never invent an id.
- Only genuine accomplishment bullets under a job or a project become bullets.
  Section headers, company/role lines, dates and contact lines are not bullets.
- If a field is absent from the document, return an empty string or empty array.
  Never guess a value that is not written down.`;

function prompt(taggedText: string): string {
  return `Convert this resume into the JSON schema. Each line is prefixed with its id.

--- RESUME ---
${taggedText}
--- END RESUME ---`;
}

// Gemini is told to echo ids verbatim, but a model that mistypes one would
// produce a bullet the export could never find. Drop those here, and report the
// count so the Import screen can say so rather than showing a short resume with
// no explanation.
function dropUnknownBulletIds(
  data: ResumeData,
  known: ReadonlySet<string>,
): { data: ResumeData; dropped: number } {
  let dropped = 0;
  const filter = <T extends { bullets: { id: string; text: string }[] }>(
    group: T,
  ): T => {
    const bullets = group.bullets.filter((b) => {
      if (known.has(b.id)) return true;
      dropped++;
      return false;
    });
    return { ...group, bullets };
  };
  return {
    data: {
      ...data,
      experience: data.experience.map(filter),
      projects: data.projects.map(filter),
    },
    dropped,
  };
}

// POST /api/resume/parse  (multipart: file=<.docx>)
// Extracts the document, has Gemini structure it, and returns the result for
// review. Writes nothing — committing is the Save step, POST /api/resume.
export async function POST(req: NextRequest) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Sign in to use Resume Tailor." },
      { status: 401 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not read the upload." },
      { status: 400 },
    );
  }
  if (!file) {
    return NextResponse.json(
      { ok: false, error: "No file was attached." },
      { status: 400 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    // .doc and .pdf are the two things people actually try. Say so explicitly,
    // because "invalid file" sends them looking for the wrong problem.
    return NextResponse.json(
      {
        ok: false,
        error: `Resume Tailor needs a .docx file. "${file.name}" isn't one — in Word, use File → Save As → .docx.`,
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "That .docx is larger than 2 MB." },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let taggedText: string;
  let knownIds: Set<string>;
  try {
    const doc = readDocx(buf);
    taggedText = doc.taggedText;
    knownIds = new Set(doc.paragraphs.map((p) => p.id));
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unreadable .docx." },
      { status: 400 },
    );
  }

  // Cross-check our paragraph scan against mammoth's independent extraction. If
  // mammoth sees substantially more prose than we tagged, the resume keeps text
  // somewhere we can't attach an id to — a text box, or a header — and the user
  // should hear that up front rather than wonder why a bullet never appears.
  const warnings: string[] = [];
  try {
    const { value: rawText } = await mammoth.extractRawText({ buffer: buf });
    const tagged = taggedText.replace(/\[p\d+\]\s*/g, "").replace(/\s+/g, "").length;
    const raw = rawText.replace(/\s+/g, "").length;
    if (raw > 0 && tagged < raw * 0.9) {
      warnings.push(
        "Some text in this .docx sits outside normal paragraphs (a text box or header). Those lines can't be tailored or replaced on export.",
      );
    }
  } catch {
    // The cross-check is advisory; never fail an import over it.
  }

  const quota = await reserveGeminiCall(session.user.id);
  if (!quota.allowed) {
    return NextResponse.json(
      { ok: false, error: quotaMessage(quota) },
      { status: 429 },
    );
  }

  let data: ResumeData;
  try {
    data = await generateJson({
      prompt: prompt(taggedText),
      systemInstruction: SYSTEM,
      schema: RESUME_RESPONSE_SCHEMA,
      coerce: coerceResumeData,
    });
  } catch (err) {
    if (err instanceof GeminiError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: err.status },
      );
    }
    throw err;
  }

  const { data: cleaned, dropped } = dropUnknownBulletIds(data, knownIds);
  if (dropped > 0) {
    warnings.push(
      `${dropped} bullet${dropped === 1 ? "" : "s"} came back with an id that isn't in the document and had to be dropped. Re-run the import if the result looks short.`,
    );
  }
  if (allBulletIds(cleaned).length === 0) {
    warnings.push(
      "No experience or project bullets were recognized. You can still edit the fields below by hand before saving.",
    );
  }

  return NextResponse.json({
    ok: true,
    data: cleaned,
    filename: file.name,
    warnings,
  });
}
