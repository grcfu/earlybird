import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readDocumentXml, extractParagraphs } from "@/lib/resume/docx";
import { applySkillAdditions } from "@/lib/resume/skills";
import { estimateFit, bodyHalfPoints, bodyCharsPerLine } from "@/lib/resume/fit";
import { generateJson, GeminiError } from "@/lib/resume/gemini";
import { reserveGeminiCall, quotaMessage } from "@/lib/resume/quota";
import {
  CUT_RESPONSE_SCHEMA,
  coerceCuts,
  coerceResumeData,
  bulletTextById,
  type CutSuggestion,
} from "@/lib/resume/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The floor the user chose: 10pt body text. Below this a resume stops being
// comfortable to read, and the point of fitting one page is being read.
const FLOOR_HALF_POINTS = 20;
const STEP_HALF_POINTS = 1; // 0.5pt

const CUT_SYSTEM = `You are helping a candidate fit their resume onto one page for a specific job.

Rank the bullets they can most afford to lose FOR THIS POSTING, weakest first. A bullet is a good candidate when it is generic, duplicates another bullet's point, or has nothing to do with what the ad asks for.

Never propose cutting a bullet that is among the strongest evidence for a requirement in the ad. Prefer cutting from older or less relevant roles.

Give at most 3. For each, say in one short sentence what is lost by cutting it — the candidate is making the decision, not you.`;

interface FitBody {
  jd?: unknown;
  edits?: unknown;
  additions?: unknown;
  skillAdds?: unknown;
  jdKeywords?: unknown;
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
    .filter((e) => e.bulletId && e.text);
}

// POST /api/resume/fit  { jd?, edits, additions }
// Estimates whether the tailored resume still fits on one page, and — only when
// it doesn't — asks which bullet is cheapest to lose. Changes nothing.
export async function POST(req: NextRequest) {
  const session = await auth().catch(() => null);
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json(
      { ok: false, error: "Sign in to use Resume Tailor." },
      { status: 401 },
    );
  }

  let body: FitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

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
  const docx = Buffer.from(row.docx);
  const known = bulletTextById(data);

  let documentXml: string;
  try {
    documentXml = readDocumentXml(docx);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Stored .docx is unreadable.",
      },
      { status: 500 },
    );
  }

  const replace = new Map<string, string>();
  for (const e of asEdits(body.edits)) {
    if (known.has(e.bulletId)) replace.set(e.bulletId, e.text);
  }
  const additions = Array.isArray(body.additions)
    ? body.additions.filter((s): s is string => typeof s === "string" && !!s.trim())
    : [];

  // A skills addition can wrap that line onto a second one, which is a real
  // line against the page budget — so it has to be in the estimate, not just in
  // the export.
  const skillAdds = Array.isArray(body.skillAdds)
    ? body.skillAdds
        .map((a) => {
          const o = (a ?? {}) as Record<string, unknown>;
          return {
            paragraphId: typeof o.paragraphId === "string" ? o.paragraphId : "",
            label: typeof o.label === "string" ? o.label : "",
            skill: typeof o.skill === "string" ? o.skill.trim() : "",
          };
        })
        .filter((a) => a.paragraphId && a.label && a.skill)
    : [];
  const jdKeywords = Array.isArray(body.jdKeywords)
    ? body.jdKeywords.filter((s): s is string => typeof s === "string")
    : [];
  if (skillAdds.length > 0) {
    const skillEdits = applySkillAdditions(
      extractParagraphs(documentXml),
      data,
      skillAdds,
      jdKeywords,
      bodyCharsPerLine(documentXml),
    );
    for (const [id, text] of skillEdits.edits) {
      if (!replace.has(id)) replace.set(id, text);
    }
  }

  const estimate = estimateFit({ documentXml, docx, replace, additions });

  // Whether a font step is even available, so the UI can offer it honestly
  // rather than presenting a button that will decline.
  const body_ = bodyHalfPoints(documentXml);
  const canShrink =
    body_ > FLOOR_HALF_POINTS && body_ - STEP_HALF_POINTS >= FLOOR_HALF_POINTS;

  // Only spend a Gemini call when there is actually a problem to solve.
  let cuts: CutSuggestion[] = [];
  let cutError = "";
  if (estimate.verdict === "spills") {
    // Only the cut ranking costs a call, so only that branch is metered — a
    // resume that fits never touches the quota.
    const quota = await reserveGeminiCall(uid);
    if (!quota.allowed) {
      return NextResponse.json({ ok: true, estimate, cuts: [], cutError: quotaMessage(quota), canShrink, bodyPt: body_ / 2, shrunkPt: (body_ - STEP_HALF_POINTS) / 2 });
    }
    const jd = typeof body.jd === "string" ? body.jd.trim().slice(0, 12_000) : "";
    // The bullets as they will appear after the accepted edits — cutting should
    // be judged on the tailored text, not the original.
    const current = [...known.entries()].map(([id, text]) => ({
      id,
      text: replace.get(id) ?? text,
    }));
    try {
      cuts = await generateJson({
        prompt: `These are the candidate's resume bullets after tailoring. The resume is about ${estimate.estimatedPages} pages and must fit on one.

--- BULLETS ---
${current.map((b) => `[${b.id}] ${b.text}`).join("\n")}
--- END BULLETS ---
${jd ? `\n--- JOB DESCRIPTION ---\n${jd}\n--- END JOB DESCRIPTION ---` : "\nNo job description was provided; judge on general resume quality."}

Return the bullet ids that are cheapest to lose, weakest first.`,
        systemInstruction: CUT_SYSTEM,
        schema: CUT_RESPONSE_SCHEMA,
        coerce: (v) => coerceCuts(v, new Set(known.keys())),
      });
    } catch (err) {
      // A failed recommendation must not block the estimate — the user can
      // still shrink the font or export anyway.
      cutError =
        err instanceof GeminiError ? err.message : "Couldn't rank bullets to cut.";
    }
  }

  return NextResponse.json({
    ok: true,
    estimate,
    cuts,
    cutError,
    canShrink,
    bodyPt: body_ / 2,
    shrunkPt: (body_ - STEP_HALF_POINTS) / 2,
  });
}
