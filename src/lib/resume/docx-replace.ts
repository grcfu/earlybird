import PizZip from "pizzip";
import {
  DOCUMENT_PATH,
  decodeXmlText,
  encodeXmlText,
  extractParagraphs,
  readDocumentXml,
} from "@/lib/resume/docx";
import { alignTokens, tokenize } from "@/lib/resume/diff";
import { tightenSpacing, shrinkBodyFont } from "@/lib/resume/fit-apply";

// Writing tailored bullets back into the user's own .docx.
//
// The whole reason this feature edits the original file instead of generating a
// new one is fidelity: their fonts, margins, spacing and list styles come out
// exactly as they went in. That fidelity has to survive the sentence level too.
// A bullet reading "Wrote tests for the **billing service** end to end" is three
// runs in Word, and the bold one carries its own <w:rPr>. Dropping the new text
// into the first run and blanking the rest would preserve the paragraph while
// quietly flattening the bold — technically formatted, visibly wrong.
//
// So the new text is distributed BACK ACROSS the original runs. Old and new are
// aligned word by word; each new word goes into the run that carried the word it
// replaced; new words inherit the run of the word before them. Bold that
// survived the reword stays bold, and text appended next to it inherits the
// formatting of its neighbour, which is what a person editing by hand would get.

export interface ReplaceResult {
  buffer: Buffer;
  // Paragraph ids actually rewritten.
  replaced: string[];
  // Ids asked for that weren't in the document, or held no editable text.
  skipped: string[];
  // Ids whose inline formatting could not be kept (single-run paragraphs are
  // not counted — there is nothing to lose there).
  flattened: string[];
  inserted: number;
  // What the fit-to-one-page levers did, or why they declined.
  fitNotes: string[];
}

interface Run {
  // The run's full XML, used when we leave it alone.
  xml: string;
  // Its <w:rPr> block, or "" — this is the formatting we are preserving.
  rPr: string;
  // Its visible text.
  text: string;
  // Whether it holds any <w:t> at all. Runs without text (a lone <w:tab/>, a
  // drawing) are passed through untouched rather than rebuilt as empty text.
  hasText: boolean;
}

const RUN_RE = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
const RPR_RE = /<w:rPr>[\s\S]*?<\/w:rPr>/;
const TEXT_IN_RUN_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

function parseRuns(paragraphXml: string): Run[] {
  const runs: Run[] = [];
  for (const m of paragraphXml.matchAll(RUN_RE)) {
    const xml = m[0];
    const texts = [...xml.matchAll(TEXT_IN_RUN_RE)].map((t) =>
      decodeXmlText(t[1]),
    );
    runs.push({
      xml,
      rPr: xml.match(RPR_RE)?.[0] ?? "",
      text: texts.join(""),
      hasText: texts.length > 0,
    });
  }
  return runs;
}

function buildRun(rPr: string, text: string): string {
  // xml:space="preserve" is required or Word trims the leading/trailing spaces
  // that hold words apart across run boundaries.
  return `<w:r>${rPr}<w:t xml:space="preserve">${encodeXmlText(text)}</w:t></w:r>`;
}

/**
 * Rewrite one paragraph's text, spreading it back over the original runs.
 *
 * Returns null when the paragraph has no text runs to write into.
 */
export function rewriteParagraph(
  paragraphXml: string,
  newText: string,
): { xml: string; flattened: boolean } | null {
  const runs = parseRuns(paragraphXml);
  const textRuns = runs.filter((r) => r.hasText);
  if (textRuns.length === 0) return null;

  // Single text run: nothing to distribute, and nothing to lose.
  if (textRuns.length === 1) {
    let done = false;
    const xml = paragraphXml.replace(RUN_RE, (runXml) => {
      const run = runs.find((r) => r.xml === runXml)!;
      if (!run.hasText) return runXml;
      if (done) return "";
      done = true;
      return buildRun(run.rPr, newText);
    });
    return { xml, flattened: false };
  }

  // Which run owns each token of the old text.
  const oldTokens: string[] = [];
  const ownerOfToken: number[] = [];
  textRuns.forEach((run, runIdx) => {
    for (const tok of tokenize(run.text)) {
      oldTokens.push(tok);
      ownerOfToken.push(runIdx);
    }
  });

  const newTokens = tokenize(newText);
  const align = alignTokens(oldTokens, newTokens);

  // Assign every new token to a run, never moving backwards. Monotonicity is
  // what guarantees the rebuilt paragraph reads as newText in order: without
  // it, a reordered phrase would scatter text between runs and scramble the
  // sentence.
  const assigned = new Array<number>(newTokens.length).fill(0);
  let cursor = 0;
  for (let j = 0; j < newTokens.length; j++) {
    const matched = align[j];
    if (matched !== null) cursor = Math.max(cursor, ownerOfToken[matched]);
    assigned[j] = cursor;
  }

  // Collect each run's new text.
  const perRun = new Array<string>(textRuns.length).fill("");
  for (let j = 0; j < newTokens.length; j++) {
    perRun[assigned[j]] += newTokens[j];
  }

  // Formatting is lost only if a run that carried text ends up with none: its
  // <w:rPr> stops applying to anything. That is the honest definition of
  // "flattened", and it is what the export reports.
  const flattened = perRun.some((t, i) => t === "" && textRuns[i].text !== "");

  let textRunIdx = 0;
  const xml = paragraphXml.replace(RUN_RE, (runXml) => {
    const run = runs.find((r) => r.xml === runXml)!;
    if (!run.hasText) return runXml;
    const text = perRun[textRunIdx++];
    // Drop a run that ends up empty rather than leaving an empty <w:t>.
    return text === "" ? "" : buildRun(run.rPr, text);
  });

  return { xml, flattened };
}

/**
 * Clone a paragraph, keeping its paragraph-level formatting but collapsing the
 * text to a single run.
 *
 * This is for brand-new bullets, and it is deliberately NOT rewriteParagraph.
 * Distributing new text over the anchor's runs is right for a reword, where the
 * runs correspond to words being edited — but for a new sentence those runs
 * correspond to nothing, so the anchor's incidental bold lands on whichever
 * words happen to line up. Cloning "Wrote tests for the **billing service**"
 * that way produced "Accomplished [X] as measured by **[Y],** by doing [Z]".
 *
 * So a new bullet takes the paragraph properties (numbering, indentation) and
 * the character formatting of the anchor's longest text run — its body style —
 * and nothing else.
 */
export function cloneParagraphWithText(
  anchorXml: string,
  text: string,
): string | null {
  const runs = parseRuns(anchorXml);
  const textRuns = runs.filter((r) => r.hasText);
  if (textRuns.length === 0) return null;

  // The longest run is the body text; a short one is more likely the emphasised
  // fragment we specifically don't want to inherit.
  const base = textRuns.reduce((a, b) => (b.text.length > a.text.length ? b : a));

  let written = false;
  return anchorXml.replace(RUN_RE, (runXml) => {
    const run = runs.find((r) => r.xml === runXml)!;
    if (!run.hasText) return runXml;
    if (written) return "";
    written = true;
    return buildRun(base.rPr, text);
  });
}

export interface DocxEdits {
  // Paragraph id -> its replacement text.
  replace: Map<string, string>;
  // Brand-new bullets, cloned from an existing bullet paragraph so they inherit
  // its list formatting, and inserted directly after it.
  insertAfter?: { id: string; texts: string[] };
  // Fit-to-one-page levers, applied after the text edits so they act on the
  // final content. Each is optional and each can decline; whatever happened is
  // reported back in ReplaceResult.fitNotes.
  fit?: {
    // Scale factor for paragraph spacing, 0-1. Omit to leave spacing alone.
    tightenSpacing?: number;
    // Step the body font down by this many HALF-points, never below the floor.
    shrinkBodyBy?: number;
    floorHalfPoints?: number;
  };
}

/**
 * Apply edits to a copy of the .docx and return the new bytes.
 *
 * The input buffer is never mutated — this reads it, rewrites the XML, and
 * generates a fresh archive, which is what keeps the stored base resume intact.
 */
export function applyDocxEdits(
  docx: Buffer | Uint8Array,
  edits: DocxEdits,
): ReplaceResult {
  const documentXml = readDocumentXml(docx);
  const paragraphs = extractParagraphs(documentXml);
  const byId = new Map(paragraphs.map((p) => [p.id, p]));

  const replaced: string[] = [];
  const skipped: string[] = [];
  const flattened: string[] = [];
  let inserted = 0;

  // Build the edit list as (start, end, replacementXml), then apply from the
  // end backwards so earlier offsets stay valid.
  const patches: { start: number; end: number; xml: string }[] = [];

  for (const [id, text] of edits.replace) {
    const p = byId.get(id);
    if (!p) {
      skipped.push(id);
      continue;
    }
    const slice = documentXml.slice(p.start, p.end);
    const out = rewriteParagraph(slice, text);
    if (!out) {
      skipped.push(id);
      continue;
    }
    replaced.push(id);
    if (out.flattened) flattened.push(id);
    patches.push({ start: p.start, end: p.end, xml: out.xml });
  }

  if (edits.insertAfter && edits.insertAfter.texts.length > 0) {
    const anchor = byId.get(edits.insertAfter.id);
    if (anchor) {
      // Clone the anchor so new bullets inherit its numbering and indentation,
      // then swap in the new text. Built from the anchor's ORIGINAL xml, not
      // from a rewritten copy, so a replaced anchor doesn't leak its new text.
      const anchorXml = documentXml.slice(anchor.start, anchor.end);
      const clones = edits.insertAfter.texts
        .map((t) => cloneParagraphWithText(anchorXml, t) ?? "")
        .filter(Boolean);
      if (clones.length > 0) {
        inserted = clones.length;
        // Insert at the anchor's end. If the anchor is also being replaced, its
        // patch covers [start,end) and this one is a zero-width insert at end,
        // so the two don't overlap.
        patches.push({ start: anchor.end, end: anchor.end, xml: clones.join("") });
      }
    }
  }

  patches.sort((a, b) => b.start - a.start);
  let out = documentXml;
  for (const p of patches) {
    out = out.slice(0, p.start) + p.xml + out.slice(p.end);
  }

  // Fit levers run last, on the finished content — tightening spacing before
  // the new bullets exist would measure the wrong document.
  const fitNotes: string[] = [];
  if (edits.fit?.tightenSpacing !== undefined) {
    const r = tightenSpacing(out, edits.fit.tightenSpacing);
    out = r.xml;
    fitNotes.push(r.note);
  }
  if (edits.fit?.shrinkBodyBy) {
    const r = shrinkBodyFont(
      out,
      edits.fit.shrinkBodyBy,
      edits.fit.floorHalfPoints ?? 20,
    );
    out = r.xml;
    fitNotes.push(r.note);
  }

  const zip = new PizZip(docx);
  zip.file(DOCUMENT_PATH, out);
  return {
    buffer: zip.generate({ type: "nodebuffer" }),
    replaced,
    skipped,
    flattened,
    inserted,
    fitNotes,
  };
}
