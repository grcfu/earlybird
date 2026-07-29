import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCompany,
  sameCompany,
  acronymOf,
  looksLikeAcronym,
} from "@/lib/apptracker/normalize";

test("normalizeCompany: variants of one company collapse", () => {
  const key = normalizeCompany("Akuna Capital");
  assert.equal(normalizeCompany("Akuna Capital Recruitment"), key);
  assert.equal(normalizeCompany("the Akuna Capital team"), key);
  assert.equal(normalizeCompany("AKUNA CAPITAL"), key);
  assert.equal(normalizeCompany("Akuna Capital, Inc."), key);
});

test("normalizeCompany: 'The Trade Desk' loses the leading 'the'", () => {
  assert.equal(normalizeCompany("The Trade Desk"), normalizeCompany("Trade Desk"));
});

test("normalizeCompany: distinct companies stay distinct", () => {
  assert.notEqual(normalizeCompany("Meta"), normalizeCompany("Meta Platforms"));
  assert.notEqual(
    normalizeCompany("Hudson River Trading"),
    normalizeCompany("Hudson Bay"),
  );
  assert.notEqual(normalizeCompany("Jane Street"), normalizeCompany("Jane"));
});

test("acronymOf: initials of a multi-word name", () => {
  assert.equal(acronymOf("Chicago Trading Company"), "ctc");
  assert.equal(acronymOf("Hudson River Trading"), "hrt");
  // Boilerplate is stripped first, so the initials don't include it.
  assert.equal(acronymOf("Chicago Trading Company Recruiting"), "ctc");
  // Nothing to abbreviate, or too long to be a safe match.
  assert.equal(acronymOf("Rippling"), null);
  assert.equal(
    acronymOf("One Two Three Four Five Six Seven"),
    null,
  );
});

test("sameCompany: an acronym matches the name it abbreviates", () => {
  // Grace's real case: "CTC" forked a second application off Chicago Trading Co.
  assert.ok(sameCompany("CTC", "Chicago Trading Company"));
  assert.ok(sameCompany("Chicago Trading Company", "CTC"));
  assert.ok(sameCompany("HRT", "Hudson River Trading"));
  // Still matches through the boilerplate stripping.
  assert.ok(sameCompany("ctc", "Chicago Trading Company, Inc."));
});

test("sameCompany: unrelated companies do not collapse", () => {
  assert.ok(!sameCompany("CTC", "Citadel"));
  assert.ok(!sameCompany("IMC", "Chicago Trading Company"));
  assert.ok(!sameCompany("Meta", "Meta Platforms"));
  assert.ok(!sameCompany("DRW", "Deepgram"));
  assert.ok(!sameCompany("", "Chicago Trading Company"));
  // Two different spelled-out names never match on initials alone.
  assert.ok(!sameCompany("Chicago Trading Company", "Citadel Trading Corp"));
});

test("looksLikeAcronym distinguishes a label from a name", () => {
  assert.ok(looksLikeAcronym("CTC"));
  assert.ok(looksLikeAcronym("C.T.C."));
  assert.ok(!looksLikeAcronym("Chicago Trading Company"));
  assert.ok(!looksLikeAcronym("Rippling"));
});
