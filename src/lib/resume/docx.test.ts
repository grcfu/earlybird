import { test } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import {
  readDocx,
  readDocumentXml,
  extractParagraphs,
  paragraphText,
  decodeXmlText,
} from "@/lib/resume/docx";
import { buildDocx, sampleResumeDocx } from "@/lib/resume/fixture";

test("a sentence split across runs reads back as one string", () => {
  // The everyday Word case: one bullet, three runs. Reading run-by-run would
  // report three fragments and no suggestion would ever match a whole bullet.
  const { paragraphs } = readDocx(sampleResumeDocx());
  const texts = paragraphs.map((p) => p.text);
  assert.ok(
    texts.includes("Built a caching layer in Go that cut p99 latency by 40%."),
    `runs did not join: ${JSON.stringify(texts)}`,
  );
});

test("inline bold does not fracture the text", () => {
  const { paragraphs } = readDocx(sampleResumeDocx());
  const texts = paragraphs.map((p) => p.text);
  assert.ok(
    texts.includes("Wrote integration tests for the billing service end to end."),
    `bold run split the sentence: ${JSON.stringify(texts)}`,
  );
});

test("paragraphs inside a table are found", () => {
  // Plenty of resumes use invisible tables for layout. Missing them would drop
  // the contact line, and with it the name the export filename depends on.
  const { paragraphs } = readDocx(sampleResumeDocx());
  assert.ok(
    paragraphs.some((p) => p.text.includes("ada@example.com")),
    "table paragraph was skipped",
  );
});

test("empty spacer paragraphs get no id, but still consume an index", () => {
  // Ids are positional, so a spacer has to hold its slot -- otherwise inserting
  // or ignoring one would renumber every bullet after it.
  const { paragraphs } = readDocx(sampleResumeDocx());
  assert.ok(!paragraphs.some((p) => p.text === ""));
  const indices = paragraphs.map((p) => p.index);
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b));
  // The blank third paragraph means index 2 is absent from the tagged list.
  assert.ok(!indices.includes(2), "spacer paragraph should not be reported");
});

test("ids are positional and stable across repeated reads", () => {
  const buf = sampleResumeDocx();
  const a = readDocx(buf).paragraphs.map((p) => `${p.id}:${p.text}`);
  const b = readDocx(buf).paragraphs.map((p) => `${p.id}:${p.text}`);
  assert.deepEqual(a, b);
  assert.equal(a[0], "p0:ADA LOVELACE");
});

test("offsets point at the paragraph's own XML", () => {
  const xml = readDocumentXml(sampleResumeDocx());
  for (const p of extractParagraphs(xml)) {
    const slice = xml.slice(p.start, p.end);
    assert.ok(slice.startsWith("<w:p"), `bad start for ${p.id}: ${slice.slice(0, 20)}`);
    assert.ok(slice.endsWith("</w:p>"), `bad end for ${p.id}`);
  }
});

test("tabs and breaks separate words instead of gluing them", () => {
  const xml =
    "<w:p><w:r><w:t>Acme</w:t></w:r><w:r><w:tab/><w:t>2026</w:t></w:r></w:p>";
  assert.equal(paragraphText(xml), "Acme 2026");
});

test("<w:tab/> is not mistaken for a text run", () => {
  // A loose /<w:t[^>]*>/ matches "<w:tab/>" too, which silently corrupts text
  // and every offset after it.
  const xml = "<w:p><w:r><w:tab/><w:t>only this</w:t></w:r></w:p>";
  assert.equal(paragraphText(xml), "only this");
});

test("field codes and tracked deletions are not read as text", () => {
  const xml =
    "<w:p><w:r><w:instrText>PAGE \\* MERGEFORMAT</w:instrText></w:r>" +
    "<w:r><w:delText>cut this</w:delText></w:r>" +
    "<w:r><w:t>keep this</w:t></w:r></w:p>";
  assert.equal(paragraphText(xml), "keep this");
});

test("XML entities decode, and ampersand decodes last", () => {
  assert.equal(decodeXmlText("Docker &amp; git"), "Docker & git");
  assert.equal(decodeXmlText("a &lt; b"), "a < b");
  // &amp;lt; is a literal "&lt;", not a "<". Decoding & first would break this.
  assert.equal(decodeXmlText("&amp;lt;"), "&lt;");
});

test("an ampersand survives the round trip out of a real archive", () => {
  const { paragraphs } = readDocx(sampleResumeDocx());
  assert.ok(
    paragraphs.some((p) => p.text === "Languages: Go, TypeScript. Tools: Docker & git."),
    "entity decoding failed through the zip",
  );
});

test("tagged text prefixes every line with its id", () => {
  const { paragraphs, taggedText } = readDocx(sampleResumeDocx());
  const lines = taggedText.split("\n");
  assert.equal(lines.length, paragraphs.length);
  assert.equal(lines[0], "[p0] ADA LOVELACE");
  for (const p of paragraphs) {
    assert.ok(taggedText.includes(`[${p.id}] ${p.text}`));
  }
});

test("self-closing empty paragraphs don't derail the scan", () => {
  const buf = buildDocx([{ runs: [{ text: "first" }] }, { runs: [{ text: "second" }] }]);
  const xml = readDocumentXml(buf).replace("<w:p><w:r><w:rPr>", "<w:p/><w:p><w:r><w:rPr>");
  const ps = extractParagraphs(xml);
  assert.deepEqual(
    ps.map((p) => p.text),
    ["first", "second"],
  );
});

test("a non-zip file is rejected with a readable message", () => {
  assert.throws(
    () => readDocx(Buffer.from("this is a PDF, actually")),
    /isn't a readable \.docx/,
  );
});

test("a zip without word/document.xml is rejected", () => {
  const notADocx = buildDocx([{ runs: [{ text: "x" }] }]);
  const zip = new PizZip(notADocx);
  zip.remove("word/document.xml");
  assert.throws(
    () => readDocx(zip.generate({ type: "nodebuffer" })),
    /no word\/document\.xml/,
  );
});

test("a docx with no text at all is rejected rather than silently empty", () => {
  assert.throws(() => readDocx(buildDocx([{ runs: [] }])), /no readable text/);
});
