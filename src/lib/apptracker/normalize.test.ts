import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCompany,
  companyKey,
  sameCompany,
  acronymOf,
  looksLikeAcronym,
  stripCompanyBoilerplate,
} from "@/lib/apptracker/normalize";

test("normalizeCompany: variants of one company collapse", () => {
  const key = normalizeCompany("Akuna Capital");
  assert.equal(normalizeCompany("Akuna Capital Recruitment"), key);
  assert.equal(normalizeCompany("the Akuna Capital team"), key);
  assert.equal(normalizeCompany("AKUNA CAPITAL"), key);
  assert.equal(normalizeCompany("Akuna Capital, Inc."), key);
});

test("a recruiting-team label peels as a unit, not word by word", () => {
  // "Roblox Early Careers" stopping at "Roblox Early" would fork Roblox in two.
  assert.equal(stripCompanyBoilerplate("Roblox Early Careers"), "Roblox");
  assert.equal(stripCompanyBoilerplate("Stripe University Recruiting"), "Stripe");
  assert.equal(stripCompanyBoilerplate("Nvidia Campus Recruiting"), "Nvidia");
  assert.equal(normalizeCompany("Roblox Early Careers"), normalizeCompany("Roblox"));
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

test("an AI suffix doesn't fork one company into two", () => {
  // Scale's rejection says "Scale AI" in the subject and "here at Scale" in the
  // body, so the two forms have to share a key.
  assert.ok(sameCompany("Scale", "Scale AI"));
  assert.ok(sameCompany("Snorkel AI", "Snorkel"));
  assert.equal(normalizeCompany("Scale AI"), normalizeCompany("Scale"));
  // Still distinct from an unrelated company.
  assert.ok(!sameCompany("Scale AI", "Snorkel AI"));
});

test("where the word breaks fall doesn't fork one company into two", () => {
  // Grace's real case: an email said "Capital One" and the assessment mail said
  // "Capitalone", so one application showed up twice with different stages.
  assert.ok(sameCompany("Capital One", "Capitalone"));
  assert.equal(companyKey("Capital One"), companyKey("CapitalOne"));
  assert.ok(sameCompany("Jane Street", "JaneStreet"));
  assert.ok(sameCompany("T-Mobile", "TMobile"));
  // Still runs through the rest of the normalization.
  assert.ok(sameCompany("The Trade Desk Recruiting", "tradedesk"));
  // And still can't collapse companies that differ by a real word.
  assert.ok(!sameCompany("Capital One", "Capital Group"));
  assert.ok(!sameCompany("Meta", "Meta Platforms"));
  assert.notEqual(companyKey("Jane Street"), companyKey("Jane"));
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
