import { test } from "node:test";
import assert from "node:assert/strict";
import { readDocx, readDocumentXml, extractParagraphs } from "@/lib/resume/docx";
import { applyDocxEdits, rewriteParagraph } from "@/lib/resume/docx-replace";
import { buildDocx, sampleResumeDocx } from "@/lib/resume/fixture";

function textOf(docx: Buffer, id: string): string {
  return readDocx(docx).paragraphs.find((p) => p.id === id)?.text ?? "";
}

function paragraphXml(docx: Buffer, id: string): string {
  const xml = readDocumentXml(docx);
  const p = extractParagraphs(xml).find((q) => q.id === id)!;
  return xml.slice(p.start, p.end);
}

test("a bullet split across runs is replaced as one sentence", () => {
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([["p5", "Designed a caching layer in Go that cut p99 latency by 40%."]]),
  });
  assert.deepEqual(out.replaced, ["p5"]);
  assert.equal(
    textOf(out.buffer, "p5"),
    "Designed a caching layer in Go that cut p99 latency by 40%.",
  );
});

test("the result is still a valid .docx that reparses", () => {
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([["p5", "New text entirely."]]),
  });
  const reread = readDocx(out.buffer);
  assert.equal(reread.paragraphs.length, 8);
  assert.equal(reread.paragraphs[0].text, "ADA LOVELACE");
});

test("the source buffer is never mutated", () => {
  // Tailoring must not touch the stored base resume.
  const original = sampleResumeDocx();
  const before = Buffer.from(original);
  applyDocxEdits(original, { replace: new Map([["p5", "Changed."]]) });
  assert.equal(Buffer.compare(original, before), 0);
  assert.equal(textOf(original, "p5"), "Built a caching layer in Go that cut p99 latency by 40%.");
});

test("untouched paragraphs keep their exact XML", () => {
  const src = sampleResumeDocx();
  const out = applyDocxEdits(src, { replace: new Map([["p5", "Changed."]]) });
  for (const id of ["p0", "p1", "p3", "p4", "p6", "p7", "p8"]) {
    assert.equal(paragraphXml(out.buffer, id), paragraphXml(src, id), `p${id} drifted`);
  }
});

test("inline bold survives a reword", () => {
  // p6 is "Wrote integration tests for the [bold]billing service[/bold] end to end."
  // This is the case the whole run-mapping approach exists for.
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([
      ["p6", "Wrote end-to-end integration tests for the billing service across teams."],
    ]),
  });
  const xml = paragraphXml(out.buffer, "p6");
  assert.ok(xml.includes("<w:b/>"), "bold run property was dropped");
  // And the bold run still carries the words it was applied to.
  const boldRun = xml.match(/<w:r><w:rPr><w:b\/><\/w:rPr><w:t[^>]*>([^<]*)</);
  assert.ok(boldRun, "no bold run left");
  assert.ok(
    boldRun![1].includes("billing service"),
    `bold moved off its words: ${JSON.stringify(boldRun![1])}`,
  );
  assert.deepEqual(out.flattened, [], "should not report flattening");
});

test("text appended after a bold phrase does not become bold", () => {
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([
      ["p6", "Wrote integration tests for the billing service end to end and beyond."],
    ]),
  });
  const xml = paragraphXml(out.buffer, "p6");
  const boldRun = xml.match(/<w:r><w:rPr><w:b\/><\/w:rPr><w:t[^>]*>([^<]*)</);
  assert.ok(boldRun);
  assert.ok(
    !boldRun![1].includes("beyond"),
    `appended text leaked into the bold run: ${JSON.stringify(boldRun![1])}`,
  );
});

test("a rewrite that deletes a formatted phrase is reported as flattened", () => {
  // Honesty over silence: if the bold run's words are gone, its formatting no
  // longer applies to anything and the export should say so.
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([["p6", "Tested everything."]]),
  });
  assert.deepEqual(out.flattened, ["p6"]);
});

test("a single-run paragraph is never reported as flattened", () => {
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([["p8", "Languages: Rust, Go."]]),
  });
  assert.equal(textOf(out.buffer, "p8"), "Languages: Rust, Go.");
  assert.deepEqual(out.flattened, []);
});

test("several paragraphs can be replaced in one pass", () => {
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([
      ["p5", "First replaced."],
      ["p6", "Second replaced."],
      ["p8", "Third replaced."],
    ]),
  });
  assert.deepEqual(out.replaced.sort(), ["p5", "p6", "p8"]);
  assert.equal(textOf(out.buffer, "p5"), "First replaced.");
  assert.equal(textOf(out.buffer, "p6"), "Second replaced.");
  assert.equal(textOf(out.buffer, "p8"), "Third replaced.");
});

test("an unknown id is skipped, not fatal", () => {
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([
      ["p5", "Replaced."],
      ["p999", "Nowhere."],
    ]),
  });
  assert.deepEqual(out.replaced, ["p5"]);
  assert.deepEqual(out.skipped, ["p999"]);
});

test("XML-special characters are escaped on the way in", () => {
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([["p5", 'Cut p99 <latency> by 40% & "more"']]),
  });
  const xml = paragraphXml(out.buffer, "p5");
  assert.ok(!xml.includes("<latency>"), "raw angle brackets corrupt the document");
  assert.ok(xml.includes("&lt;latency&gt;"));
  assert.equal(textOf(out.buffer, "p5"), 'Cut p99 <latency> by 40% & "more"');
});

test("new bullets are cloned from an anchor and inherit its list formatting", () => {
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map(),
    insertAfter: { id: "p6", texts: ["Accomplished [X] as measured by [Y]."] },
  });
  assert.equal(out.inserted, 1);
  const reread = readDocx(out.buffer);
  const texts = reread.paragraphs.map((p) => p.text);
  const at = texts.indexOf("Accomplished [X] as measured by [Y].");
  assert.ok(at > 0, "inserted bullet not found");
  // Directly after its anchor, and before the next section.
  assert.equal(texts[at - 1], "Wrote integration tests for the billing service end to end.");
  assert.equal(texts[at + 1], "SKILLS");
  // <w:numPr> is what makes Word render it as a list item.
  const xml = readDocumentXml(out.buffer);
  const p = extractParagraphs(xml).find((q) => q.text.startsWith("Accomplished"))!;
  assert.ok(xml.slice(p.start, p.end).includes("<w:numPr>"), "lost list formatting");
});

test("a new bullet does not inherit the anchor's inline bold", () => {
  // Regression: cloning p6 by distributing text over its runs put the anchor's
  // bold on whichever new words lined up, yielding
  // "Accomplished [X] as measured by **[Y],** by doing [Z]".
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map(),
    insertAfter: { id: "p6", texts: ["Accomplished [X] as measured by [Y], by doing [Z]."] },
  });
  const xml = readDocumentXml(out.buffer);
  const p = extractParagraphs(xml).find((q) => q.text.startsWith("Accomplished"))!;
  const slice = xml.slice(p.start, p.end);
  assert.ok(!slice.includes("<w:b/>"), `new bullet inherited bold: ${slice}`);
  // But it must still be a list item.
  assert.ok(slice.includes("<w:numPr>"), "lost list formatting");
});

test("a new bullet inherits the anchor's body character style, not a short emphasis", () => {
  const src = buildDocx([
    {
      bullet: true,
      runs: [
        { text: "A much longer stretch of ordinary body text here", italic: true },
        { text: " KEY", bold: true },
      ],
    },
  ]);
  const out = applyDocxEdits(src, {
    replace: new Map(),
    insertAfter: { id: "p0", texts: ["Fresh bullet."] },
  });
  const xml = readDocumentXml(out.buffer);
  const p = extractParagraphs(xml).find((q) => q.text === "Fresh bullet.")!;
  const slice = xml.slice(p.start, p.end);
  assert.ok(slice.includes("<w:i/>"), "should take the long run's italic body style");
  assert.ok(!slice.includes("<w:b/>"), "should not take the short emphasised run's bold");
});

test("inserting after a paragraph that is also being replaced keeps both", () => {
  // The insert is a zero-width patch at the anchor's end, so it must not
  // collide with the replacement patch covering the anchor itself.
  const out = applyDocxEdits(sampleResumeDocx(), {
    replace: new Map([["p6", "Rewrote the billing tests."]]),
    insertAfter: { id: "p6", texts: ["A brand new bullet."] },
  });
  const texts = readDocx(out.buffer).paragraphs.map((p) => p.text);
  const at = texts.indexOf("Rewrote the billing tests.");
  assert.ok(at > 0);
  assert.equal(texts[at + 1], "A brand new bullet.");
});

test("a paragraph with no text runs cannot be rewritten", () => {
  const xml = "<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:tab/></w:r></w:p>";
  assert.equal(rewriteParagraph(xml, "anything"), null);
});

test("a run holding only a tab is passed through untouched", () => {
  const xml =
    '<w:p><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Acme</w:t></w:r></w:p>';
  const out = rewriteParagraph(xml, "Globex")!;
  assert.ok(out.xml.includes("<w:tab/>"), "tab run was destroyed");
  assert.ok(out.xml.includes("Globex"));
});

test("an empty replacement empties the paragraph without breaking the file", () => {
  const out = applyDocxEdits(sampleResumeDocx(), { replace: new Map([["p5", ""]]) });
  const reread = readDocx(out.buffer);
  assert.ok(!reread.paragraphs.some((p) => p.id === "p5"));
  assert.equal(reread.paragraphs[0].text, "ADA LOVELACE");
});

test("a three-run sentence keeps all three runs when all three keep words", () => {
  const src = buildDocx([
    {
      runs: [
        { text: "Alpha " },
        { text: "Beta", bold: true },
        { text: " Gamma" },
      ],
    },
  ]);
  const out = applyDocxEdits(src, {
    replace: new Map([["p0", "Alpha now Beta still Gamma"]]),
  });
  assert.equal(textOf(out.buffer, "p0"), "Alpha now Beta still Gamma");
  const xml = paragraphXml(out.buffer, "p0");
  assert.equal((xml.match(/<w:r>/g) ?? []).length, 3);
  assert.ok(xml.includes("<w:b/>"));
  assert.deepEqual(out.flattened, []);
});

// --- fit-to-one-page levers -------------------------------------------------

test("fit levers apply to the exported copy and are reported", () => {
  const src = buildDocx([
    { runs: [{ text: "HEADING", bold: true }], sz: 28 },
    { bullet: true, runs: [{ text: "Body bullet one." }], sz: 22 },
    { bullet: true, runs: [{ text: "Body bullet two." }], sz: 22 },
    { bullet: true, runs: [{ text: "Body bullet three." }], sz: 22 },
  ]);
  const out = applyDocxEdits(src, {
    replace: new Map([["p1", "Body bullet one, reworded."]]),
    fit: { shrinkBodyBy: 1, floorHalfPoints: 20 },
  });
  const xml = readDocumentXml(out.buffer);
  assert.ok(xml.includes('w:val="21"'), "body should be 10.5pt");
  assert.ok(xml.includes('w:val="28"'), "heading keeps 14pt");
  assert.ok(out.fitNotes.some((n) => /10\.5pt/.test(n)), out.fitNotes.join("; "));
  // The text edit still landed.
  assert.equal(textOf(out.buffer, "p1"), "Body bullet one, reworded.");
});

test("fit levers run after insertion, so new bullets are shrunk too", () => {
  // Shrinking before the new bullet exists would leave it at the old size.
  const src = buildDocx([
    { bullet: true, runs: [{ text: "One." }], sz: 22 },
    { bullet: true, runs: [{ text: "Two." }], sz: 22 },
    { bullet: true, runs: [{ text: "Three." }], sz: 22 },
  ]);
  const out = applyDocxEdits(src, {
    replace: new Map(),
    insertAfter: { id: "p2", texts: ["A brand new bullet."] },
    fit: { shrinkBodyBy: 1, floorHalfPoints: 20 },
  });
  const xml = readDocumentXml(out.buffer);
  const p = extractParagraphs(xml).find((q) => q.text === "A brand new bullet.")!;
  assert.ok(
    xml.slice(p.start, p.end).includes('w:val="21"'),
    "the inserted bullet must be shrunk with the rest",
  );
});

test("declining a lever is reported rather than silently skipped", () => {
  const src = buildDocx([{ runs: [{ text: "a" }], sz: 20 }, { runs: [{ text: "b" }], sz: 20 }]);
  const out = applyDocxEdits(src, {
    replace: new Map(),
    fit: { shrinkBodyBy: 1, floorHalfPoints: 20 },
  });
  assert.ok(out.fitNotes.some((n) => /floor/.test(n)), out.fitNotes.join("; "));
});

test("no fit option means no fit notes and no formatting change", () => {
  const src = buildDocx([{ bullet: true, runs: [{ text: "One." }], sz: 22 }]);
  const out = applyDocxEdits(src, { replace: new Map([["p0", "Two."]]) });
  assert.deepEqual(out.fitNotes, []);
  assert.ok(readDocumentXml(out.buffer).includes('w:val="22"'));
});
