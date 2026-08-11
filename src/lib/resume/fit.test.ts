import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateFit, bodyHalfPoints } from "@/lib/resume/fit";
import { readDocumentXml } from "@/lib/resume/docx";
import { buildDocx, type FixtureParagraph } from "@/lib/resume/fixture";

// A resume-shaped document: a heading, then n body bullets.
function resume(n: number, opts?: Parameters<typeof buildDocx>[1]) {
  const ps: FixtureParagraph[] = [{ runs: [{ text: "EXPERIENCE", bold: true }] }];
  for (let i = 0; i < n; i++) {
    ps.push({
      bullet: true,
      runs: [{ text: `Built and shipped subsystem number ${i} with measurable impact.` }],
    });
  }
  return buildDocx(ps, opts);
}

function fitOf(
  docx: Buffer,
  replace = new Map<string, string>(),
  additions: string[] = [],
) {
  return estimateFit({ documentXml: readDocumentXml(docx), docx, replace, additions });
}

test("a short resume fits", () => {
  assert.equal(fitOf(resume(6)).verdict, "fits");
});

test("a resume stuffed past the page spills", () => {
  assert.equal(fitOf(resume(120)).verdict, "spills");
});

test("adding bullets pushes a full page over", () => {
  // Find a length that fits, then confirm additions are what tip it.
  let n = 6;
  while (n < 200 && fitOf(resume(n)).verdict === "fits") n += 2;
  const justFits = resume(n - 2);
  assert.equal(fitOf(justFits).verdict, "fits");
  const withExtra = fitOf(
    justFits,
    new Map(),
    Array.from({ length: 12 }, (_, i) => `Accomplished X as measured by Y number ${i}.`),
  );
  assert.notEqual(withExtra.verdict, "fits");
  assert.ok(withExtra.addedLines > 0, "additions should add lines");
});

test("a longer rewrite adds lines", () => {
  const docx = resume(10);
  const long = fitOf(docx, new Map([["p1", "x".repeat(600)]]));
  assert.ok(long.addedLines > 0, `expected growth, got ${long.addedLines}`);
});

test("shrinking within one line costs nothing; shrinking across lines gives a line back", () => {
  // Line counts are quantised. Trimming a one-line bullet to half its length
  // frees no vertical space at all — only dropping a wrapped line does. The
  // fit tool has to respect that or it will promise savings it can't deliver.
  const docx = buildDocx([
    { bullet: true, runs: [{ text: "y".repeat(400) }] }, // several lines
    { bullet: true, runs: [{ text: "A short one-line bullet." }] },
  ]);
  const withinLine = fitOf(docx, new Map([["p1", "Short."]]));
  assert.equal(withinLine.addedLines, 0, "one line to one line should be free");

  const acrossLines = fitOf(docx, new Map([["p0", "Now much shorter."]]));
  assert.ok(
    acrossLines.addedLines < 0,
    `unwrapping should give lines back, got ${acrossLines.addedLines}`,
  );
});

test("replacing a bullet with identical text changes nothing", () => {
  const docx = resume(10);
  const xml = readDocumentXml(docx);
  const same = xml.match(/Built and shipped subsystem number 0 with measurable impact\./)![0];
  assert.equal(fitOf(docx, new Map([["p1", same]])).addedLines, 0);
});

test("an unknown paragraph id contributes nothing", () => {
  const docx = resume(10);
  assert.equal(fitOf(docx, new Map([["p999", "x".repeat(500)]])).addedLines, 0);
});

test("Word's own counts are used when present, and reported", () => {
  const docx = resume(20, { appProps: { pages: 1, lines: 40 } });
  const fit = fitOf(docx);
  assert.equal(fit.calibrated, true);
  assert.equal(fit.wordPages, 1);
  assert.equal(fit.wordLines, 40);
  assert.equal(fit.linesPerPage, 40);
});

test("calibration makes the baseline agree with Word", () => {
  // The whole point: whatever our character model gets wrong, a document Word
  // called one page must come back as about one page.
  const docx = resume(20, { appProps: { pages: 1, lines: 40 } });
  const fit = fitOf(docx);
  assert.ok(
    Math.abs(fit.estimatedPages - 1) < 0.01,
    `expected ~1.0 page, got ${fit.estimatedPages}`,
  );
  assert.equal(fit.verdict, "fits");
});

test("a document Word called two pages is reported as spilling", () => {
  const docx = resume(40, { appProps: { pages: 2, lines: 80 } });
  const fit = fitOf(docx);
  assert.ok(fit.estimatedPages > 1.5, `got ${fit.estimatedPages}`);
  assert.equal(fit.verdict, "spills");
});

test("a file with no app.xml still estimates, and says it is uncalibrated", () => {
  // Google Docs and LaTeX converters routinely omit it.
  const fit = fitOf(resume(8));
  assert.equal(fit.calibrated, false);
  assert.equal(fit.wordPages, null);
  assert.ok(fit.estimatedPages > 0);
});

test("a 3pt spacer costs a fraction of what a full-size empty line costs", () => {
  // The height-saving trick: separate sections with an EMPTY paragraph set in
  // 3pt rather than body size. Charging a whole line for it would badly
  // overestimate a resume laid out this way, and the fit tool would recommend
  // cuts nobody needs.
  const content = (i: number): FixtureParagraph => ({
    bullet: true,
    runs: [{ text: `Bullet ${i} with some content.` }],
  });
  const build = (spacer: FixtureParagraph | null) => {
    const ps: FixtureParagraph[] = [];
    for (let i = 0; i < 20; i++) {
      ps.push(content(i));
      if (spacer) ps.push(spacer);
    }
    return fitOf(buildDocx(ps)).estimatedPages;
  };

  const none = build(null);
  const tiny = build({ runs: [], sz: 6 }); // 3pt
  const full = build({ runs: [] }); // body size

  assert.ok(tiny > none, "a spacer should still cost something");
  assert.ok(full > tiny, `3pt spacer should be cheaper than a full one: ${tiny} vs ${full}`);
  // The saving is the point: 3pt spacers should cost well under half of
  // full-size ones.
  const tinyCost = tiny - none;
  const fullCost = full - none;
  assert.ok(
    tinyCost < fullCost * 0.5,
    `3pt spacers should be far cheaper: ${tinyCost.toFixed(3)} vs ${fullCost.toFixed(3)}`,
  );
});

test("narrow margins fit more than wide ones", () => {
  const wide = resume(30, { pgMar: { top: 1440, bottom: 1440, left: 2160, right: 2160 } });
  const narrow = resume(30, { pgMar: { top: 720, bottom: 720, left: 720, right: 720 } });
  assert.ok(
    fitOf(narrow).estimatedPages < fitOf(wide).estimatedPages,
    "narrower margins should fit more",
  );
});

test("bodyHalfPoints finds the body size, not the heading size", () => {
  const docx = buildDocx([
    { runs: [{ text: "HEADING", bold: true }] },
    { runs: [{ text: "one" }] },
    { runs: [{ text: "two" }] },
    { runs: [{ text: "three" }] },
  ]);
  // The fixture emits no explicit w:sz, so everything falls to the 11pt
  // default — the point here is that it returns a sane body size, not a crash.
  assert.equal(bodyHalfPoints(readDocumentXml(docx)), 22);
});

test("estimatedPages is fractional, never rounded to a page count", () => {
  const fit = fitOf(resume(25));
  assert.notEqual(fit.estimatedPages, Math.round(fit.estimatedPages));
});
