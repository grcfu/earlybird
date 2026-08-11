import { test } from "node:test";
import assert from "node:assert/strict";
import { tightenSpacing, shrinkBodyFont } from "@/lib/resume/fit-apply";
import { readDocumentXml } from "@/lib/resume/docx";
import { buildDocx } from "@/lib/resume/fixture";

const withSpacing = (before: number, after: number) =>
  `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}"/></w:pPr>` +
  `<w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>text</w:t></w:r></w:p>`;

test("spacing is scaled toward zero and the saving is reported", () => {
  const out = tightenSpacing(withSpacing(240, 120), 0.5);
  assert.equal(out.applied, true);
  assert.ok(out.xml.includes('w:before="120"'));
  assert.ok(out.xml.includes('w:after="60"'));
  assert.match(out.note, /recovered/);
});

test("a factor of 0 removes spacing entirely", () => {
  const out = tightenSpacing(withSpacing(240, 240), 0);
  assert.ok(out.xml.includes('w:before="0"'));
  assert.ok(out.xml.includes('w:after="0"'));
});

test("already-tight spacing is left alone and says so", () => {
  // The user's resume is like this: spacing already squeezed to nothing. The
  // tool must report that rather than claim a saving it didn't make.
  const out = tightenSpacing(withSpacing(0, 0), 0.5);
  assert.equal(out.applied, false);
  assert.match(out.note, /already as tight/);
  assert.equal(out.xml, withSpacing(0, 0));
});

test("a document with no spacing tags is untouched", () => {
  const xml = "<w:p><w:r><w:t>plain</w:t></w:r></w:p>";
  const out = tightenSpacing(xml, 0.5);
  assert.equal(out.applied, false);
  assert.equal(out.xml, xml);
});

test("body font steps down and headings keep their size", () => {
  const docx = buildDocx([
    { runs: [{ text: "HEADING", bold: true }], sz: 28 }, // 14pt
    { runs: [{ text: "body one" }], sz: 22 }, // 11pt
    { runs: [{ text: "body two" }], sz: 22 },
    { runs: [{ text: "body three" }], sz: 22 },
  ]);
  const out = shrinkBodyFont(readDocumentXml(docx), 1, 20); // -0.5pt, floor 10pt
  assert.equal(out.applied, true);
  assert.ok(out.xml.includes('w:val="21"'), "body should be 10.5pt");
  assert.ok(out.xml.includes('w:val="28"'), "heading must keep 14pt");
  assert.ok(!out.xml.includes('w:val="22"'), "no body run left at 11pt");
  assert.match(out.note, /11pt → 10\.5pt/);
});

test("3pt spacers are not shrunk along with the body", () => {
  // Shrinking these would undo the layout trick they exist for, and they are
  // already far below anything readable.
  const docx = buildDocx([
    { runs: [{ text: "body one" }], sz: 22 },
    { runs: [], sz: 6 },
    { runs: [{ text: "body two" }], sz: 22 },
    { runs: [{ text: "body three" }], sz: 22 },
  ]);
  const out = shrinkBodyFont(readDocumentXml(docx), 1, 20);
  assert.equal(out.applied, true);
  assert.ok(out.xml.includes('w:val="6"'), "3pt spacer must survive untouched");
});

test("the floor is a hard stop, not a suggestion", () => {
  const docx = buildDocx([
    { runs: [{ text: "a" }], sz: 20 }, // already 10pt
    { runs: [{ text: "b" }], sz: 20 },
  ]);
  const out = shrinkBodyFont(readDocumentXml(docx), 1, 20);
  assert.equal(out.applied, false);
  assert.match(out.note, /already 10pt/);
});

test("a step that would cross the floor is refused, not clamped", () => {
  // Clamping would silently produce a different size than asked for.
  const docx = buildDocx([
    { runs: [{ text: "a" }], sz: 21 }, // 10.5pt
    { runs: [{ text: "b" }], sz: 21 },
  ]);
  const out = shrinkBodyFont(readDocumentXml(docx), 2, 20); // -1pt would hit 9.5pt
  assert.equal(out.applied, false);
  assert.match(out.note, /below the 10pt floor/);
});

test("a resume that sets its size in a Word style is refused with an explanation", () => {
  // No explicit w:sz anywhere: rewriting styles.xml would change more than the
  // body, so this declines rather than guessing.
  const docx = buildDocx([
    { runs: [{ text: "one" }] },
    { runs: [{ text: "two" }] },
  ]);
  const out = shrinkBodyFont(readDocumentXml(docx), 1, 20);
  assert.equal(out.applied, false);
  assert.match(out.note, /Word style/);
});

test("szCs is stepped down alongside sz", () => {
  const xml =
    '<w:p><w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>x</w:t></w:r></w:p>' +
    '<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>y</w:t></w:r></w:p>';
  const out = shrinkBodyFont(xml, 1, 20);
  assert.ok(out.xml.includes('<w:szCs w:val="21"/>'), "complex-script size must follow");
});
