import { test } from "node:test";
import assert from "node:assert/strict";
import { categorize, normalizeCategory } from "@/lib/ingest/categorize";
import { Category } from "@/generated/prisma/client";

test("categorize: infers family from the title", () => {
  assert.equal(categorize("Software Engineer Intern"), Category.SWE);
  assert.equal(categorize("Machine Learning Intern"), Category.ML_AI);
  assert.equal(categorize("Quantitative Trader Intern"), Category.QUANT);
  assert.equal(categorize("Data Scientist Intern"), Category.DATA);
  assert.equal(categorize("FPGA Hardware Intern"), Category.HARDWARE);
  assert.equal(categorize("Product Manager Intern"), Category.PM);
  assert.equal(categorize("Marketing Intern"), Category.OTHER);
});

test("categorize: more specific families beat the SWE catch-all", () => {
  // "Engineer" alone is SWE, but "ML Engineer" should resolve to ML_AI.
  assert.equal(categorize("Machine Learning Engineer Intern"), Category.ML_AI);
  assert.equal(categorize("Quant Research Engineer"), Category.QUANT);
});

test("categorize: non-software engineering disciplines are NOT SWE", () => {
  // These carry "Engineer(ing)" but must not pollute the SWE filter — they
  // resolve to OTHER (which the feed excludes).
  assert.equal(categorize("Mechanical Engineering Intern"), Category.OTHER);
  assert.equal(categorize("Manufacturing Engineering Intern"), Category.OTHER);
  assert.equal(categorize("Process Engineering Intern"), Category.OTHER);
  assert.equal(categorize("Thermal Engineering Intern"), Category.OTHER);
  assert.equal(categorize("Civil Engineer Intern"), Category.OTHER);
  assert.equal(categorize("Chemical Engineering Intern"), Category.OTHER);
});

test("categorize: explicit software wins even at a manufacturing org", () => {
  // "software" is matched before the non-software-engineering rule.
  assert.equal(categorize("Manufacturing Test Software Intern"), Category.SWE);
  assert.equal(categorize("Backend Developer Intern"), Category.SWE);
  // Generic engineering roles still land in SWE via the broad catch-all.
  assert.equal(categorize("Systems Engineer Intern"), Category.SWE);
});

test("normalizeCategory: trusts a usable source label", () => {
  assert.equal(normalizeCategory("AI/ML/Data", "Some Intern"), Category.ML_AI);
  assert.equal(normalizeCategory("Software", "Some Intern"), Category.SWE);
  assert.equal(normalizeCategory("Quant", "Some Intern"), Category.QUANT);
  assert.equal(normalizeCategory("Hardware", "Some Intern"), Category.HARDWARE);
  assert.equal(normalizeCategory("Product", "Some Intern"), Category.PM);
});

test("normalizeCategory: falls back to the title when no/unknown label", () => {
  assert.equal(normalizeCategory(null, "Software Engineer Intern"), Category.SWE);
  assert.equal(
    normalizeCategory("Mystery Dept", "Data Engineer Intern"),
    Category.DATA,
  );
});
