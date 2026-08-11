import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reorderSkillLine,
  surfaceSkillsInDocx,
  parseSkillLine,
  renderSkillLine,
  planSkillAddition,
} from "@/lib/resume/skills";
import { readDocx } from "@/lib/resume/docx";
import { buildDocx } from "@/lib/resume/fixture";
import { coerceResumeData } from "@/lib/resume/schema";

const resume = coerceResumeData({
  basics: { name: "Ada Lovelace" },
  skills: {
    languages: ["Go", "TypeScript", "Python"],
    frameworks: ["Next.js"],
    tools: ["Docker", "git"],
    concepts: [],
  },
});

test("a surfaced skill moves to the front, everything else keeps its order", () => {
  assert.equal(
    reorderSkillLine("Languages: Go, TypeScript, Python", ["Python"]),
    "Languages: Python, Go, TypeScript",
  );
});

test("several surfaced skills keep their relative order", () => {
  assert.equal(
    reorderSkillLine("Languages: Go, TypeScript, Python, Rust", ["Python", "Rust"]),
    "Languages: Python, Rust, Go, TypeScript",
  );
});

test("matching is case-insensitive", () => {
  assert.equal(
    reorderSkillLine("Tools: Docker, git", ["DOCKER"]),
    "Tools: Docker, git",
  );
  assert.equal(reorderSkillLine("Tools: git, Docker", ["docker"]), "Tools: Docker, git");
});

test("trailing punctuation stays at the end of the line", () => {
  // Without this the full stop rides along with whichever item moves.
  assert.equal(
    reorderSkillLine("Languages: Go, TypeScript, Python.", ["Python"]),
    "Languages: Python, Go, TypeScript.",
  );
});

test("nothing is added or removed — only reordered", () => {
  const before = "Languages: Go, TypeScript, Python";
  const after = reorderSkillLine(before, ["Python"])!;
  const items = (s: string) => s.split(":")[1].split(",").map((x) => x.trim()).sort();
  assert.deepEqual(items(after), items(before));
});

test("a skill not present on the line is ignored rather than inserted", () => {
  // Surfacing must never invent a skill the candidate doesn't claim.
  assert.equal(reorderSkillLine("Languages: Go, TypeScript", ["Rust"]), null);
});

test("unparseable or pointless lines are left alone", () => {
  assert.equal(reorderSkillLine("No colon here at all", ["Go"]), null);
  assert.equal(reorderSkillLine("Languages: Go", ["Go"]), null); // single item
  assert.equal(reorderSkillLine("Languages: Go, TypeScript", ["Go", "TypeScript"]), null);
  assert.equal(reorderSkillLine("Languages: Go, , Python", ["Python"]), null); // empty item
});

test("the skills paragraph is found by content, in a real document", () => {
  const docx = buildDocx([
    { runs: [{ text: "ADA LOVELACE", bold: true }] },
    { runs: [{ text: "SKILLS", bold: true }] },
    { runs: [{ text: "Languages: Go, TypeScript, Python" }] },
  ]);
  const { paragraphs } = readDocx(docx);
  const edits = surfaceSkillsInDocx(paragraphs, resume, ["Python"]);
  assert.deepEqual([...edits.entries()], [["p2", "Languages: Python, Go, TypeScript"]]);
});

test("an unrelated labelled list is not mistaken for skills", () => {
  // "Coursework: ..." is a labelled comma list too. Requiring two known skills
  // is what keeps it from being rewritten.
  const docx = buildDocx([
    { runs: [{ text: "Coursework: Algorithms, Databases, Compilers" }] },
  ]);
  const { paragraphs } = readDocx(docx);
  assert.equal(surfaceSkillsInDocx(paragraphs, resume, ["Python"]).size, 0);
});

test("a bullet that merely contains a colon is not rewritten", () => {
  const docx = buildDocx([
    { bullet: true, runs: [{ text: "Built a thing: it used Go, TypeScript and care" }] },
  ]);
  const { paragraphs } = readDocx(docx);
  // Only one comma-separated item matches a known skill, so it is left alone.
  assert.equal(surfaceSkillsInDocx(paragraphs, resume, ["Go"]).size, 0);
});

test("no surfaced skills means no edits at all", () => {
  const docx = buildDocx([{ runs: [{ text: "Languages: Go, TypeScript, Python" }] }]);
  const { paragraphs } = readDocx(docx);
  assert.equal(surfaceSkillsInDocx(paragraphs, resume, []).size, 0);
});

// --- Multi-list parsing and the one-line budget ------------------------------

// The user's actual skills line: two lists in one paragraph.
const REAL = "Languages: Go, TypeScript. Tools: Docker & git.";

test("a multi-list skills line parses into its lists", () => {
  const segs = parseSkillLine(REAL)!;
  assert.equal(segs.length, 2);
  assert.deepEqual(segs[0], { label: "Languages", items: ["Go", "TypeScript"], trailer: ".", lead: "" });
  assert.deepEqual(segs[1].label, "Tools");
  assert.deepEqual(segs[1].items, ["Docker & git"]);
});

test("parse then render round-trips the text exactly", () => {
  // Anything less and rewriting a skills line would silently reformat it.
  for (const text of [
    REAL,
    "Languages: Go, TypeScript, Python",
    "Languages: Go, TypeScript; Tools: Docker, git;",
    "Skills: A, B, C.",
  ]) {
    assert.equal(renderSkillLine(parseSkillLine(text)!), text, text);
  }
});

test("a line with no label is refused rather than guessed at", () => {
  assert.equal(parseSkillLine("Just a sentence with no list"), null);
  assert.equal(parseSkillLine(""), null);
});

test("adding fits free when there is room on the line", () => {
  const plan = planSkillAddition(REAL, "Tools", "Kubernetes", [], 200)!;
  assert.equal(plan.freeFit, true);
  assert.deepEqual(plan.dropped, []);
  assert.ok(plan.text.includes("Kubernetes"));
  assert.ok(plan.text.startsWith("Languages: Go, TypeScript."), "other list untouched");
});

test("adding swaps out the least relevant skill when the line would wrap", () => {
  const text = "Languages: Go, TypeScript, Python, Ruby";
  // Tight budget forces a swap. Ruby is rightmost and unwanted, so it goes.
  const plan = planSkillAddition(text, "Languages", "Rust", ["Rust", "Go"], 40)!;
  assert.equal(plan.freeFit, false);
  assert.deepEqual(plan.dropped, ["Ruby"]);
  assert.ok(plan.text.includes("Rust"));
  assert.ok(!plan.text.includes("Ruby"));
  assert.ok(plan.text.length <= 40, plan.text);
});

test("a swap never drops a skill the posting asked for", () => {
  // Go is wanted, so even though it is a drop candidate by position, it stays.
  const text = "Languages: Go, TypeScript, Python";
  const plan = planSkillAddition(text, "Languages", "Rust", ["Rust", "Go", "Python"], 30)!;
  assert.ok(!plan.dropped.includes("Go"));
  assert.ok(!plan.dropped.includes("Python"));
  assert.ok(plan.text.includes("Go"));
});

test("when everything left is wanted, it says the line still wraps", () => {
  // Honesty over a bad swap: the caller decides what to do about it.
  const text = "Languages: Go, TypeScript";
  const plan = planSkillAddition(text, "Languages", "Rust", ["Go", "TypeScript", "Rust"], 10)!;
  assert.equal(plan.stillWraps, true);
  assert.deepEqual(plan.dropped, []);
});

test("adding a skill that is already listed changes nothing", () => {
  const plan = planSkillAddition(REAL, "Languages", "go", [], 200)!;
  assert.equal(plan.text, REAL);
  assert.deepEqual(plan.dropped, []);
});

test("an unknown label is refused", () => {
  assert.equal(planSkillAddition(REAL, "Frameworks", "React", [], 200), null);
});

test("the other lists are never disturbed by an addition", () => {
  const text = "Languages: Go, TypeScript, Ruby. Tools: Docker, git, make.";
  const plan = planSkillAddition(text, "Languages", "Rust", ["Rust"], 50)!;
  assert.ok(plan.text.includes("Tools: Docker, git, make."), plan.text);
});
