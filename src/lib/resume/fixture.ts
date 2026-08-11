import PizZip from "pizzip";
import { DOCUMENT_PATH } from "@/lib/resume/docx";

// Builds a minimal but genuinely valid .docx in memory, for tests.
//
// Real Word files split one sentence across several <w:t> runs at arbitrary
// points — a spell-check pass or a single bold word is enough to fracture a
// paragraph into five runs. Every interesting bug in reading and rewriting a
// .docx lives at those seams, so the fixtures here are built from explicit run
// lists rather than one run per paragraph. A fixture that used a single run per
// paragraph would pass tests that the real files fail.

export interface FixtureRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface FixtureParagraph {
  runs: FixtureRun[];
  // Emits <w:numPr>, which is how Word marks a list item.
  bullet?: boolean;
  // Wrap this paragraph in a single-cell table, the way resumes that use
  // invisible tables for layout do.
  inTable?: boolean;
  // Font size in HALF-points (Word's unit), applied to the paragraph mark and
  // to every run. Needed to express the height-saving trick real resumes use:
  // an empty spacer paragraph set in 3pt (sz: 6) instead of full body size.
  sz?: number;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function runXml(r: FixtureRun, sz?: number): string {
  const props: string[] = [];
  if (r.bold) props.push("<w:b/>");
  if (r.italic) props.push("<w:i/>");
  if (sz) props.push(`<w:sz w:val="${sz}"/>`);
  const rPr = props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";
  // xml:space="preserve" matters: without it Word drops leading/trailing
  // spaces, which is exactly how runs get glued together wrongly.
  return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(r.text)}</w:t></w:r>`;
}

function paragraphXml(p: FixtureParagraph): string {
  const inner =
    (p.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "") +
    (p.sz ? `<w:rPr><w:sz w:val="${p.sz}"/></w:rPr>` : "");
  const pPr = inner ? `<w:pPr>${inner}</w:pPr>` : "";
  const body = `<w:p>${pPr}${p.runs.map((r) => runXml(r, p.sz)).join("")}</w:p>`;
  if (!p.inTable) return body;
  return `<w:tbl><w:tr><w:tc>${body}</w:tc></w:tr></w:tbl>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

export interface FixtureOptions {
  // Page geometry, in twips (1 inch = 1440). Defaults to US Letter with 1"
  // margins, which is what a resume template almost always is.
  pgSz?: { w: number; h: number };
  pgMar?: { top: number; bottom: number; left: number; right: number };
  // Word writes docProps/app.xml on save, with its own count of pages and
  // lines. Omit to simulate a file from Google Docs or a LaTeX converter,
  // which often ship without it.
  appProps?: { pages: number; lines: number };
}

const DEFAULT_MAR = { top: 1440, bottom: 1440, left: 1440, right: 1440 };

export function buildDocx(
  paragraphs: FixtureParagraph[],
  opts: FixtureOptions = {},
): Buffer {
  const pgSz = opts.pgSz ?? { w: 12240, h: 15840 };
  const mar = opts.pgMar ?? DEFAULT_MAR;
  const body = paragraphs.map(paragraphXml).join("");
  const sectPr =
    `<w:sectPr><w:pgSz w:w="${pgSz.w}" w:h="${pgSz.h}"/>` +
    `<w:pgMar w:top="${mar.top}" w:right="${mar.right}" w:bottom="${mar.bottom}" w:left="${mar.left}"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}${sectPr}</w:body>
</w:document>`;

  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file(DOCUMENT_PATH, document);
  if (opts.appProps) {
    zip.file(
      "docProps/app.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Pages>${opts.appProps.pages}</Pages><Lines>${opts.appProps.lines}</Lines><Words>420</Words></Properties>`,
    );
  }
  return zip.generate({ type: "nodebuffer" });
}

// A small resume with the shapes that break naive implementations: a bullet
// fractured across three runs, a bullet with a bold phrase in the middle, a
// paragraph laid out inside a table, and an empty spacer paragraph.
export function sampleResumeDocx(): Buffer {
  return buildDocx([
    { runs: [{ text: "ADA LOVELACE", bold: true }] },
    { runs: [{ text: "ada@example.com | (615) 555-0142 | Nashville, TN" }], inTable: true },
    { runs: [] },
    { runs: [{ text: "EXPERIENCE", bold: true }] },
    { runs: [{ text: "Acme Corp — Software Engineering Intern" }] },
    {
      bullet: true,
      // One sentence, three runs — the everyday case.
      runs: [
        { text: "Built a caching " },
        { text: "layer in Go that cut " },
        { text: "p99 latency by 40%." },
      ],
    },
    {
      bullet: true,
      // Inline bold mid-sentence: the case that must survive a reword.
      runs: [
        { text: "Wrote integration tests for the " },
        { text: "billing service", bold: true },
        { text: " end to end." },
      ],
    },
    { runs: [{ text: "SKILLS", bold: true }] },
    { runs: [{ text: "Languages: Go, TypeScript. Tools: Docker & git." }] },
  ]);
}
