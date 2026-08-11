import PizZip from "pizzip";

// Reading a .docx well enough to tailor it.
//
// A .docx is a zip; the prose lives in word/document.xml as a flat run of <w:p>
// paragraph elements. We walk those in document order, pull each one's visible
// text, and mint an id from its position. Position is a sound id source here
// precisely because the stored file never changes: tailoring works on an
// in-memory copy and export writes a byte-copy, so paragraph 12 is paragraph 12
// for the life of the resume.
//
// Why not read the text from mammoth and match it back up later: the export has
// to find a sentence inside the XML and replace it. That only works if the text
// we tagged with an id is the same string the XML actually holds, character for
// character. Extracting both from the same pass guarantees it; matching
// mammoth's normalized output back onto runs would not.

export const DOCUMENT_PATH = "word/document.xml";

export interface DocxParagraph {
  // Stable handle for this paragraph, e.g. "p12". This is the bullet id that
  // travels through Gemini and comes back on a suggestion.
  id: string;
  // Position among all <w:p> elements in document order.
  index: number;
  // Visible text, exactly as the document holds it.
  text: string;
  // Byte offsets of this paragraph's XML within document.xml: [start, end).
  // The replacer edits these slices in place.
  start: number;
  end: number;
}

// Matches a whole <w:p> element, self-closing or not. Word never nests
// paragraphs inside paragraphs, so a non-greedy scan to the next </w:p> is
// correct. Paragraphs inside tables are ordinary <w:p> elements and are picked
// up by the same scan, which matters because plenty of resumes are laid out in
// invisible tables.
const PARAGRAPH_RE = /<w:p(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/w:p>)/g;

// Only true text runs. Written to exclude <w:tab/>, <w:instrText> (field codes
// like PAGE) and <w:delText> (tracked deletions) — a looser <w:t[^>]*> would
// swallow <w:tab/> and corrupt the offsets.
const TEXT_RUN_RE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

// Things that render as whitespace rather than as characters. Matched in the
// same pass as text runs (below) rather than pre-substituted: a space swapped
// into the XML would sit outside any <w:t> and be dropped by the run scan.
const BREAK_RE = /<w:(?:tab|br|cr)(?:\s[^>]*)?\/>/g;

// One scan over a paragraph, in document order, matching either a text run or a
// whitespace element so the two interleave correctly.
const RUN_OR_BREAK_RE = new RegExp(
  `${TEXT_RUN_RE.source}|${BREAK_RE.source}`,
  "g",
);

export function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand last, so &amp;lt; decodes to &lt; and not to "<".
    .replace(/&amp;/g, "&");
}

export function encodeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Concatenated visible text of one paragraph's XML.
export function paragraphText(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(RUN_OR_BREAK_RE)) {
    // Group 1 is set for a text run; otherwise this matched a tab/break, which
    // renders as a space between the words either side of it.
    out += m[1] === undefined ? " " : decodeXmlText(m[1]);
  }
  // Word splits a sentence across runs at arbitrary points, so the join can
  // leave doubled spaces. Collapse for the *reported* text; the replacer works
  // off run content directly and is unaffected.
  return out.replace(/\s+/g, " ").trim();
}

export function readDocumentXml(docx: Buffer | Uint8Array): string {
  let zip: PizZip;
  try {
    zip = new PizZip(docx);
  } catch {
    throw new Error("That file isn't a readable .docx (it isn't a zip archive).");
  }
  const file = zip.file(DOCUMENT_PATH);
  if (!file) {
    throw new Error(
      "That .docx has no word/document.xml — it may be a .doc renamed, or corrupt.",
    );
  }
  return file.asText();
}

/**
 * Every paragraph in the document, in order, with an id and its XML offsets.
 * Empty paragraphs (spacers) are skipped: they carry no text to tag or replace,
 * but they still consume an index so ids stay tied to true document position.
 */
export function extractParagraphs(documentXml: string): DocxParagraph[] {
  const out: DocxParagraph[] = [];
  let index = 0;
  for (const m of documentXml.matchAll(PARAGRAPH_RE)) {
    const xml = m[0];
    const i = index++;
    const text = paragraphText(xml);
    if (!text) continue;
    out.push({
      id: `p${i}`,
      index: i,
      text,
      start: m.index,
      end: m.index + xml.length,
    });
  }
  return out;
}

/**
 * The document rendered for Gemini, one paragraph per line, each prefixed with
 * its id in brackets.
 *
 * The bracket prefix is how ids survive the round trip: the model is told to
 * copy the id of the line it used into each bullet, so a suggestion can be tied
 * back to one exact paragraph without any fuzzy text matching.
 */
export function toTaggedText(paragraphs: DocxParagraph[]): string {
  return paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n");
}

// Convenience: open a .docx and return both the paragraphs and the tagged text.
export function readDocx(docx: Buffer | Uint8Array): {
  documentXml: string;
  paragraphs: DocxParagraph[];
  taggedText: string;
} {
  const documentXml = readDocumentXml(docx);
  const paragraphs = extractParagraphs(documentXml);
  if (paragraphs.length === 0) {
    throw new Error("That .docx has no readable text.");
  }
  return { documentXml, paragraphs, taggedText: toTaggedText(paragraphs) };
}
