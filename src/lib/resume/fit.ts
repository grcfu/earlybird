import PizZip from "pizzip";
import { extractParagraphs, paragraphText } from "@/lib/resume/docx";

// Estimating whether the tailored resume still fits on one page.
//
// A .docx does not know how many pages it is. Pagination happens when a
// renderer lays the document out, and there is no Word or LibreOffice on
// Vercel. So this estimates — and the estimate is calibrated against Word's own
// numbers rather than invented from font metrics alone.
//
// The trick: Word records <Pages> and <Lines> in docProps/app.xml when it saves.
// We compute our own geometric line count for the UNEDITED document, compare it
// to what Word counted, and keep the ratio. That ratio absorbs everything our
// crude character-width model gets wrong — the actual typeface, kerning, the
// real default line height — because it is measured against the same document.
// Applying it to our estimate of the EDITED document is far better grounded
// than a raw geometric guess.
//
// Files without app.xml (Google Docs exports, LaTeX converters) fall back to the
// uncalibrated geometry. Every result says which path it took, and nothing here
// ever claims to be a page count.

const TWIPS_PER_POINT = 20;
// Word's "single" line spacing is about 1.15x the font size for the fonts
// resumes actually use. Only a starting point — calibration corrects it.
const LINE_HEIGHT_FACTOR = 1.15;
// Mean glyph advance as a fraction of the em, for proportional text. Also only
// a starting point.
const CHAR_WIDTH_EM = 0.5;
const DEFAULT_HALF_POINTS = 22; // 11pt

export type FitVerdict = "fits" | "borderline" | "spills";

export interface FitEstimate {
  verdict: FitVerdict;
  // Estimated pages for the edited document. Deliberately fractional: "1.08
  // pages" is honest in a way that "2 pages" is not.
  estimatedPages: number;
  // Lines the accepted edits add (negative if the rewrite is shorter).
  addedLines: number;
  linesPerPage: number;
  // True when Word's own counts were available to calibrate against.
  calibrated: boolean;
  // What Word last recorded, when present.
  wordPages: number | null;
  wordLines: number | null;
}

interface Geometry {
  usableWidthTwips: number;
  usableHeightTwips: number;
}

function readGeometry(documentXml: string): Geometry {
  const pgSz = documentXml.match(/<w:pgSz\b[^>]*\/?>/)?.[0] ?? "";
  const pgMar = documentXml.match(/<w:pgMar\b[^>]*\/?>/)?.[0] ?? "";
  const attr = (s: string, name: string, fallback: number) => {
    const m = s.match(new RegExp(`w:${name}="(\\d+)"`));
    return m ? Number(m[1]) : fallback;
  };
  // US Letter with 1" margins is the overwhelming default for a resume.
  const w = attr(pgSz, "w", 12240);
  const h = attr(pgSz, "h", 15840);
  const left = attr(pgMar, "left", 1440);
  const right = attr(pgMar, "right", 1440);
  const top = attr(pgMar, "top", 1440);
  const bottom = attr(pgMar, "bottom", 1440);
  return {
    usableWidthTwips: Math.max(1, w - left - right),
    usableHeightTwips: Math.max(1, h - top - bottom),
  };
}

// Font size of a paragraph, in half-points, from the first w:sz it declares.
function paragraphHalfPoints(xml: string): number {
  const m = xml.match(/<w:sz\s+w:val="(\d+)"/);
  return m ? Number(m[1]) : DEFAULT_HALF_POINTS;
}

// Extra vertical space this paragraph asks for, in twips.
function paragraphSpacingTwips(xml: string): number {
  const s = xml.match(/<w:spacing\b[^>]*\/?>/)?.[0] ?? "";
  const before = Number(s.match(/w:before="(\d+)"/)?.[1] ?? 0);
  const after = Number(s.match(/w:after="(\d+)"/)?.[1] ?? 0);
  return before + after;
}

// How many wrapped lines a string of this length occupies at this size.
function wrappedLines(
  chars: number,
  halfPoints: number,
  geom: Geometry,
): number {
  const pt = halfPoints / 2;
  const charWidth = CHAR_WIDTH_EM * pt * TWIPS_PER_POINT;
  const perLine = Math.max(1, Math.floor(geom.usableWidthTwips / charWidth));
  return Math.max(1, Math.ceil(chars / perLine));
}

// Vertical space a paragraph occupies, expressed in "standard lines" so that a
// 3pt spacer counts as the fraction of a line it really is rather than as 1.
function paragraphLineUnits(
  xml: string,
  text: string,
  geom: Geometry,
  baseHalfPoints: number,
): number {
  const hp = paragraphHalfPoints(xml);
  const baseLineTwips = (baseHalfPoints / 2) * LINE_HEIGHT_FACTOR * TWIPS_PER_POINT;
  const ownLineTwips = (hp / 2) * LINE_HEIGHT_FACTOR * TWIPS_PER_POINT;
  // An empty paragraph still occupies one line at ITS size — which is exactly
  // how a 3pt spacer saves space, and why treating it as a whole line would
  // wildly overestimate a tightly-laid-out resume.
  const lines = text === "" ? 1 : wrappedLines(text.length, hp, geom);
  const twips = lines * ownLineTwips + paragraphSpacingTwips(xml);
  return twips / baseLineTwips;
}

// The document's body font: the most common size across paragraphs that have
// text. Headings are the minority, so the mode is the body.
export function bodyHalfPoints(documentXml: string): number {
  const counts = new Map<number, number>();
  for (const m of documentXml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    if (!paragraphText(m[0])) continue;
    const hp = paragraphHalfPoints(m[0]);
    counts.set(hp, (counts.get(hp) ?? 0) + 1);
  }
  let best = DEFAULT_HALF_POINTS;
  let bestN = 0;
  for (const [hp, n] of counts) {
    if (n > bestN) {
      best = hp;
      bestN = n;
    }
  }
  return best;
}

function readAppProps(docx: Buffer | Uint8Array): {
  pages: number | null;
  lines: number | null;
} {
  try {
    const file = new PizZip(docx).file("docProps/app.xml");
    if (!file) return { pages: null, lines: null };
    const xml = file.asText();
    const num = (tag: string) => {
      const m = xml.match(new RegExp(`<${tag}>(\\d+)</${tag}>`));
      return m ? Number(m[1]) : null;
    };
    return { pages: num("Pages"), lines: num("Lines") };
  } catch {
    return { pages: null, lines: null };
  }
}

/** Total line units of a document as it stands. */
function documentLineUnits(
  documentXml: string,
  geom: Geometry,
  baseHalfPoints: number,
): number {
  let total = 0;
  for (const m of documentXml.matchAll(/<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/g)) {
    total += paragraphLineUnits(m[0], paragraphText(m[0]), geom, baseHalfPoints);
  }
  return total;
}

export interface FitInput {
  documentXml: string;
  docx: Buffer | Uint8Array;
  // Paragraph id -> replacement text, as the export will apply them.
  replace: Map<string, string>;
  // Brand-new bullet texts.
  additions: string[];
}

/**
 * Estimate whether the edited document still fits on one page.
 *
 * Never returns a page count as fact. `verdict` is the thing to show a user;
 * `estimatedPages` exists so the UI can say how close it is.
 */
export function estimateFit(input: FitInput): FitEstimate {
  const { documentXml, docx, replace, additions } = input;
  const geom = readGeometry(documentXml);
  const base = bodyHalfPoints(documentXml);

  const ourBaseline = documentLineUnits(documentXml, geom, base);
  const { pages: wordPages, lines: wordLines } = readAppProps(docx);

  // Calibrate our model against Word's own count of the same document.
  const calibrated =
    wordLines !== null && wordLines > 0 && ourBaseline > 0 && wordPages !== null;
  const factor = calibrated ? wordLines! / ourBaseline : 1;

  // Lines per page: measured when Word told us, else derived from geometry.
  const baseLineTwips = (base / 2) * LINE_HEIGHT_FACTOR * TWIPS_PER_POINT;
  const linesPerPage =
    calibrated && wordPages! > 0
      ? wordLines! / wordPages!
      : geom.usableHeightTwips / baseLineTwips;

  // Delta from the edits, in the same units.
  const paragraphs = extractParagraphs(documentXml);
  const byId = new Map(paragraphs.map((p) => [p.id, p]));
  let delta = 0;
  for (const [id, text] of replace) {
    const p = byId.get(id);
    if (!p) continue;
    const xml = documentXml.slice(p.start, p.end);
    delta +=
      paragraphLineUnits(xml, text, geom, base) -
      paragraphLineUnits(xml, p.text, geom, base);
  }
  // A new bullet is a whole extra paragraph at body size.
  for (const text of additions) {
    delta += wrappedLines(text.length, base, geom);
  }

  const editedLines = (ourBaseline + delta) * factor;
  const estimatedPages = editedLines / linesPerPage;

  // A 3% band, because the estimate is not precise enough to call 1.01 a spill.
  const verdict: FitVerdict =
    estimatedPages <= 1.0 ? "fits" : estimatedPages <= 1.03 ? "borderline" : "spills";

  return {
    verdict,
    estimatedPages: Math.round(estimatedPages * 100) / 100,
    addedLines: Math.round(delta * factor * 10) / 10,
    linesPerPage: Math.round(linesPerPage * 10) / 10,
    calibrated,
    wordPages,
    wordLines,
  };
}
