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
