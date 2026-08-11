import { test } from "node:test";
import assert from "node:assert/strict";
import { reorderSkillLine, surfaceSkillsInDocx } from "@/lib/resume/skills";
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
