import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeListings } from "@/lib/ingest/dedupe";
import type { NormalizedListing } from "@/lib/ingest/types";
import { Category } from "@/generated/prisma/client";

const PRIORITY = ["vanshb03", "Simplify"];

function listing(over: Partial<NormalizedListing>): NormalizedListing {
  return {
    id: "shared-id",
    source: "vanshb03",
    company: "Acme",
    title: "Software Engineer Intern",
    category: Category.SWE,
    locations: [],
    applyUrl: "https://acme.com/1",
    sponsorship: null,
    season: null,
    datePosted: null,
    active: true,
    ...over,
  };
}

test("mergeListings: leaves unique rows untouched", () => {
  const a = listing({ id: "a" });
  const b = listing({ id: "b" });
  const { merged, collapsed } = mergeListings([a, b], PRIORITY);
  assert.equal(merged.length, 2);
  assert.equal(collapsed, 0);
});

test("mergeListings: collapses same-id rows from different sources", () => {
  const fromVansh = listing({
    source: "vanshb03",
    locations: ["NYC"],
    category: Category.OTHER,
    datePosted: new Date("2026-02-01"),
    active: false,
  });
  const fromSimplify = listing({
    source: "Simplify",
    locations: ["SF", "NYC"],
    category: Category.SWE,
    sponsorship: "Does Not Offer Sponsorship",
    datePosted: new Date("2026-01-01"),
    active: true,
  });

  const { merged, collapsed } = mergeListings([fromVansh, fromSimplify], PRIORITY);
  assert.equal(merged.length, 1);
  assert.equal(collapsed, 1);

  const m = merged[0];
  // Combined source label, priority order.
  assert.equal(m.source, "vanshb03+Simplify");
  // Locations unioned, de-duplicated.
  assert.deepEqual([...m.locations].sort(), ["NYC", "SF"]);
  // First non-OTHER category wins.
  assert.equal(m.category, Category.SWE);
  // Earliest posting date kept.
  assert.deepEqual(m.datePosted, new Date("2026-01-01"));
  // active if ANY source is active.
  assert.equal(m.active, true);
  // First non-null field by priority.
  assert.equal(m.sponsorship, "Does Not Offer Sponsorship");
});

test("mergeListings: higher-priority source wins company/title casing", () => {
  const a = listing({ source: "vanshb03", company: "Acme Inc" });
  const b = listing({ source: "Simplify", company: "ACME INCORPORATED" });
  const { merged } = mergeListings([b, a], PRIORITY); // order shouldn't matter
  assert.equal(merged[0].company, "Acme Inc");
});
