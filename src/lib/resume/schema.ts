// The Resume Tailor data contract: the TypeScript shapes plus the JSON schemas
// we hand Gemini so it can only answer in those shapes.
//
// Kept Prisma-free and dependency-free (like stages.ts) so client components can
// import the types without pulling in the DB client or the Gemini SDK.
//
// Two schemas live here because there are two Gemini calls:
//   PARSE   — .docx plain text  → ResumeData      (the base resume)
//   ANALYZE — resume + a job ad → TailorAnalysis  (the suggested edits)

// --- The base resume ---------------------------------------------------------

// A single bullet. `id` is the load-bearing field: it is what ties a suggestion
// back to one exact line, and what the export looks up to know which sentence to
// replace in the .docx. Ids are minted from the document itself (see
// docx-extract.ts) and must stay stable for the life of the stored resume —
// Gemini is told to echo them back, never to invent them.
export interface ResumeBullet {
  id: string;
  text: string;
}

export interface ResumeBasics {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  dates: string;
  location: string;
  details: string;
}

export interface ResumeExperience {
  company: string;
  role: string;
  dates: string;
  location: string;
  bullets: ResumeBullet[];
}

export interface ResumeProject {
  name: string;
  stack: string;
  dates: string;
  link: string;
  bullets: ResumeBullet[];
}

export interface ResumeSkills {
  languages: string[];
  frameworks: string[];
  tools: string[];
  concepts: string[];
}

export interface ResumeData {
  basics: ResumeBasics;
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  skills: ResumeSkills;
}

// --- The tailoring analysis --------------------------------------------------

// How well the resume already speaks to one keyword from the job ad.
//   present — the resume says it outright
//   weak    — something adjacent is there but it is not stated in their words
//   missing — nothing in the resume covers it
export type CoverageStatus = "present" | "weak" | "missing";

export interface CoverageItem {
  keyword: string;
  status: CoverageStatus;
  // Where in the resume it shows up ("Experience — Acme"), or why it doesn't.
  where: string;
}

// One proposed rewrite. `bulletId` points at an existing bullet, or is "" when
// this is a brand-new bullet Gemini is proposing to add (`original` empty too).
export interface BulletSuggestion {
  bulletId: string;
  original: string;
  revised: string;
  rationale: string;
  keywords_surfaced: string[];
}

export interface TailorAnalysis {
  company: string;
  jd_keywords: string[];
  coverage: CoverageItem[];
  bullet_suggestions: BulletSuggestion[];
  skills_to_surface: string[];
  honest_gaps: string[];
}

// --- Gemini response schemas -------------------------------------------------
// Gemini's schema dialect is OpenAPI-ish with UPPERCASE type names. Every object
// lists `required` so the model cannot omit a field and leave us guessing, and
// `propertyOrdering` because the API honours it and a stable key order makes
// responses easier to eyeball in logs.

const STRING = { type: "STRING" } as const;
const STRING_ARRAY = { type: "ARRAY", items: { type: "STRING" } } as const;

const BULLET_SCHEMA = {
  type: "OBJECT",
  properties: { id: STRING, text: STRING },
  required: ["id", "text"],
  propertyOrdering: ["id", "text"],
} as const;

export const RESUME_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    basics: {
      type: "OBJECT",
      properties: {
        name: STRING,
        email: STRING,
        phone: STRING,
        location: STRING,
        links: STRING_ARRAY,
      },
      required: ["name", "email", "phone", "location", "links"],
      propertyOrdering: ["name", "email", "phone", "location", "links"],
    },
    education: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          school: STRING,
          degree: STRING,
          dates: STRING,
          location: STRING,
          details: STRING,
        },
        required: ["school", "degree", "dates", "location", "details"],
        propertyOrdering: ["school", "degree", "dates", "location", "details"],
      },
    },
    experience: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          company: STRING,
          role: STRING,
          dates: STRING,
          location: STRING,
          bullets: { type: "ARRAY", items: BULLET_SCHEMA },
        },
        required: ["company", "role", "dates", "location", "bullets"],
        propertyOrdering: ["company", "role", "dates", "location", "bullets"],
      },
    },
    projects: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: STRING,
          stack: STRING,
          dates: STRING,
          link: STRING,
          bullets: { type: "ARRAY", items: BULLET_SCHEMA },
        },
        required: ["name", "stack", "dates", "link", "bullets"],
        propertyOrdering: ["name", "stack", "dates", "link", "bullets"],
      },
    },
    skills: {
      type: "OBJECT",
      properties: {
        languages: STRING_ARRAY,
        frameworks: STRING_ARRAY,
        tools: STRING_ARRAY,
        concepts: STRING_ARRAY,
      },
      required: ["languages", "frameworks", "tools", "concepts"],
      propertyOrdering: ["languages", "frameworks", "tools", "concepts"],
    },
  },
  required: ["basics", "education", "experience", "projects", "skills"],
  propertyOrdering: [
    "basics",
    "education",
    "experience",
    "projects",
    "skills",
  ],
} as const;

export const ANALYSIS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    company: STRING,
    jd_keywords: STRING_ARRAY,
    coverage: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          keyword: STRING,
          status: { type: "STRING", enum: ["present", "weak", "missing"] },
          where: STRING,
        },
        required: ["keyword", "status", "where"],
        propertyOrdering: ["keyword", "status", "where"],
      },
    },
    bullet_suggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          bulletId: STRING,
          original: STRING,
          revised: STRING,
          rationale: STRING,
          keywords_surfaced: STRING_ARRAY,
        },
        required: [
          "bulletId",
          "original",
          "revised",
          "rationale",
          "keywords_surfaced",
        ],
        propertyOrdering: [
          "bulletId",
          "original",
          "revised",
          "rationale",
          "keywords_surfaced",
        ],
      },
    },
    skills_to_surface: STRING_ARRAY,
    honest_gaps: STRING_ARRAY,
  },
  required: [
    "company",
    "jd_keywords",
    "coverage",
    "bullet_suggestions",
    "skills_to_surface",
    "honest_gaps",
  ],
  propertyOrdering: [
    "company",
    "jd_keywords",
    "coverage",
    "bullet_suggestions",
    "skills_to_surface",
    "honest_gaps",
  ],
} as const;

// --- Defensive coercion ------------------------------------------------------
// Schema mode makes the shape very likely, not guaranteed: the model can still
// stop early on a token limit, and a JSON column read back from Postgres is
// `unknown` as far as the compiler is concerned. Everything below turns
// arbitrary input into a valid object, dropping what it can't use, so no caller
// ever has to null-check its way through a resume.

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// Bullets with no id are unusable — nothing could map a suggestion back to them,
// and the export would have no anchor to replace — so they're dropped, not
// patched with a generated id that matches nothing in the document.
function coerceBullets(v: unknown): ResumeBullet[] {
  return arr(v)
    .map((b) => {
      const o = obj(b);
      return { id: str(o.id), text: str(o.text) };
    })
    .filter((b) => b.id !== "" && b.text !== "");
}

export function coerceResumeData(v: unknown): ResumeData {
  const o = obj(v);
  const basics = obj(o.basics);
  const skills = obj(o.skills);
  return {
    basics: {
      name: str(basics.name),
      email: str(basics.email),
      phone: str(basics.phone),
      location: str(basics.location),
      links: strArray(basics.links),
    },
    education: arr(o.education).map((e) => {
      const x = obj(e);
      return {
        school: str(x.school),
        degree: str(x.degree),
        dates: str(x.dates),
        location: str(x.location),
        details: str(x.details),
      };
    }),
    experience: arr(o.experience).map((e) => {
      const x = obj(e);
      return {
        company: str(x.company),
        role: str(x.role),
        dates: str(x.dates),
        location: str(x.location),
        bullets: coerceBullets(x.bullets),
      };
    }),
    projects: arr(o.projects).map((p) => {
      const x = obj(p);
      return {
        name: str(x.name),
        stack: str(x.stack),
        dates: str(x.dates),
        link: str(x.link),
        bullets: coerceBullets(x.bullets),
      };
    }),
    skills: {
      languages: strArray(skills.languages),
      frameworks: strArray(skills.frameworks),
      tools: strArray(skills.tools),
      concepts: strArray(skills.concepts),
    },
  };
}

function coerceStatus(v: unknown): CoverageStatus {
  const s = str(v).toLowerCase();
  return s === "present" || s === "weak" || s === "missing" ? s : "missing";
}

// `validIds` is the allow-list of bullet ids from the stored resume. A
// suggestion naming an id we don't have would silently do nothing at export
// time, so it's rejected here where it can still be reported. An empty bulletId
// is kept: that's the model proposing a brand-new bullet.
export function coerceAnalysis(
  v: unknown,
  validIds?: ReadonlySet<string>,
): TailorAnalysis {
  const o = obj(v);
  return {
    company: str(o.company),
    jd_keywords: strArray(o.jd_keywords),
    coverage: arr(o.coverage)
      .map((c) => {
        const x = obj(c);
        return {
          keyword: str(x.keyword),
          status: coerceStatus(x.status),
          where: str(x.where),
        };
      })
      .filter((c) => c.keyword !== ""),
    bullet_suggestions: arr(o.bullet_suggestions)
      .map((b) => {
        const x = obj(b);
        return {
          bulletId: str(x.bulletId),
          original: str(x.original),
          revised: str(x.revised),
          rationale: str(x.rationale),
          keywords_surfaced: strArray(x.keywords_surfaced),
        };
      })
      // A rewrite with no new text is noise; so is one pointing at a bullet that
      // isn't in this resume.
      .filter((b) => b.revised !== "")
      .filter((b) => !validIds || b.bulletId === "" || validIds.has(b.bulletId)),
    skills_to_surface: strArray(o.skills_to_surface),
    honest_gaps: strArray(o.honest_gaps),
  };
}

// Every bullet id in a resume, in document order. Used to build the allow-list
// above and to drive the export's lookup table.
export function allBulletIds(data: ResumeData): string[] {
  const ids: string[] = [];
  for (const e of data.experience) for (const b of e.bullets) ids.push(b.id);
  for (const p of data.projects) for (const b of p.bullets) ids.push(b.id);
  return ids;
}

// Flat id → text map over experience and project bullets.
export function bulletTextById(data: ResumeData): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of data.experience) for (const b of e.bullets) m.set(b.id, b.text);
  for (const p of data.projects) for (const b of p.bullets) m.set(b.id, b.text);
  return m;
}
