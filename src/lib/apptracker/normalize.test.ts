import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCompany } from "@/lib/apptracker/normalize";

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
