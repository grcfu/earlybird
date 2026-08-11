import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateJson, GeminiError } from "@/lib/resume/gemini";
import { reserveGeminiCall, quotaMessage } from "@/lib/resume/quota";
import {
  ANALYSIS_RESPONSE_SCHEMA,
  coerceAnalysis,
  coerceResumeData,
  bulletTextById,
  type ResumeData,
  type TailorAnalysis,
} from "@/lib/resume/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Comparing a whole resume against a whole job ad is the slowest call here.
export const maxDuration = 60;

// Long job ads are mostly boilerplate (benefits, EEO statements). Truncating
// keeps the request inside a sane token budget; the requirements are always
// near the top.
const MAX_JD_CHARS = 12_000;

const SYSTEM = `You tailor a resume to one job description. You work for the candidate, and your value is being honest with them.

WHAT YOU MAY DO
1. Reword an existing bullet so it speaks the job ad's language. Set bulletId to that bullet's id.
2. Propose a NEW bullet in Google's X-Y-Z form: "Accomplished [X] as measured by [Y], by doing [Z]". Set bulletId to "" and original to "".
3. Name existing skills worth surfacing, and list keywords the resume is missing.

THE FACTS RULE
A reworded bullet must state exactly the same facts as the original. Same numbers, same technologies, same scope, same seniority. You may change emphasis, ordering and vocabulary. You may NOT change what happened. Never inflate a contribution, never promote a team's work to the candidate's, never turn "helped with" into "led".

THE BRACKET RULE
If you introduce ANY specific that is not in the resume — a metric, a percentage, a tool, a team size, a timeframe — wrap it in square brackets so the candidate can see it needs filling in. Write "[X]%", "[N] users", "[Kubernetes]". Never present an invented number as though it were theirs. A bullet full of brackets is fine; a bullet with a fabricated fact is not.

HONEST GAPS
honest_gaps is where you say what the resume genuinely does not show. Do not paper over a missing requirement by inventing experience for it. If the ad wants five years of Rust and the candidate has none, that belongs in honest_gaps, not in a bullet.

COVERAGE
For each important keyword in the ad: "present" if the resume says it outright, "weak" if something adjacent is there but not in those words, "missing" if nothing covers it. "where" names the section, or explains the absence.

SCOPE
Suggest edits only where they help. Rewriting every bullet is noise. At most 12 suggestions, best first.`;

function buildPrompt(
  data: ResumeData,
  jd: string,
  companyOverride: string,
): string {
  // Only the parts that matter for tailoring, so the model isn't distracted by
  // contact details it must not touch.
  const resume = {
    experience: data.experience.map((e) => ({
      company: e.company,
      role: e.role,
      dates: e.dates,
      bullets: e.bullets,
    })),
    projects: data.projects.map((p) => ({
      name: p.name,
      stack: p.stack,
      bullets: p.bullets,
    })),
    skills: data.skills,
  };

  const companyLine = companyOverride
    ? `\nThe candidate says the company is "${companyOverride}". Use that as "company".`
    : `\nSet "company" to the hiring company named in the ad, or "" if it isn't named.`;

  return `Tailor this resume to the job description below.${companyLine}

Every bullet has an id. When you reword one, echo its id EXACTLY into bulletId
and put the untouched original text into "original". For a new bullet use "" for
both.

--- RESUME (JSON) ---
${JSON.stringify(resume)}
--- END RESUME ---

--- JOB DESCRIPTION ---
${jd}
--- END JOB DESCRIPTION ---`;
}

// A "reworded" bullet identical to the original is a no-op that would still
// render as a togglable diff showing no change. Drop those.
function dropNoOpSuggestions(
  analysis: TailorAnalysis,
  originals: Map<string, string>,
): TailorAnalysis {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return {
    ...analysis,
    bullet_suggestions: analysis.bullet_suggestions
      .map((s) => ({
        ...s,
        // Trust our stored copy of the original over the model's echo of it:
        // the diff must be against what the resume actually says.
        original: s.bulletId ? (originals.get(s.bulletId) ?? s.original) : "",
      }))
      .filter((s) => norm(s.revised) !== norm(s.original)),
  };
}

// POST /api/resume/analyze  { jd, company? }
export async function POST(req: NextRequest) {
  const session = await auth().catch(() => null);
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json(
      { ok: false, error: "Sign in to use Resume Tailor." },
      { status: 401 },
    );
  }

  let body: { jd?: unknown; company?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const jd = typeof body.jd === "string" ? body.jd.trim() : "";
  const companyOverride =
    typeof body.company === "string" ? body.company.trim() : "";
  if (jd.length < 80) {
    return NextResponse.json(
      {
        ok: false,
        error: "Paste the full job description — that's too short to tailor against.",
      },
      { status: 400 },
    );
  }

  // Read the resume server-side rather than accepting one from the client:
  // the suggestions must be about the resume that will actually be exported.
  const row = await prisma.resume.findUnique({
    where: { userId: uid },
    select: { data: true },
  });
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "Import a resume first." },
      { status: 400 },
    );
  }
  const data = coerceResumeData(row.data);
  const originals = bulletTextById(data);

  // Count this against the user's daily ceiling before spending the call.
  const quota = await reserveGeminiCall(uid);
  if (!quota.allowed) {
    return NextResponse.json(
      { ok: false, error: quotaMessage(quota) },
      { status: 429 },
    );
  }

  let analysis: TailorAnalysis;
  try {
    analysis = await generateJson({
      prompt: buildPrompt(data, jd.slice(0, MAX_JD_CHARS), companyOverride),
      systemInstruction: SYSTEM,
      schema: ANALYSIS_RESPONSE_SCHEMA,
      // Suggestions naming a bullet this resume doesn't have are dropped here,
      // where they can still be counted, rather than failing silently later.
      coerce: (v) => coerceAnalysis(v, new Set(originals.keys())),
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

  const cleaned = dropNoOpSuggestions(analysis, originals);
  // The override always wins: the user can see the ad, the model only infers.
  if (companyOverride) cleaned.company = companyOverride;

  return NextResponse.json({ ok: true, analysis: cleaned });
}
