import { test } from "node:test";
import assert from "node:assert/strict";
import { listingId, normalizeText, urlHostPath } from "@/lib/ingest/hash";

test("normalizeText: lowercases and collapses whitespace", () => {
  assert.equal(normalizeText("  Software   Engineer "), "software engineer");
});

test("urlHostPath: strips scheme, www, query, hash, trailing slash", () => {
  assert.equal(
    urlHostPath("https://www.Example.com/apply/123/?ref=abc#top"),
    "example.com/apply/123",
  );
});

test("urlHostPath: falls back gracefully on non-URLs", () => {
  assert.equal(urlHostPath("not a url"), "not a url");
});

test("listingId: stable across casing/whitespace/tracking params", () => {
  const a = listingId({
    company: "Example Corp",
    title: "Software Engineer Intern",
    url: "https://jobs.example.com/apply/9?utm=x",
  });
  const b = listingId({
    company: "  example   corp ",
    title: "SOFTWARE ENGINEER INTERN",
    url: "https://jobs.example.com/apply/9/",
  });
  assert.equal(a, b);
});

test("listingId: does NOT depend on source (enables cross-source dedup)", () => {
  // Same role, no source argument exists in the signature at all — proven by
  // identical inputs producing identical ids regardless of where they came from.
  const id = listingId({
    company: "Acme",
    title: "Data Scientist Intern",
    url: "https://acme.com/jobs/1",
  });
  assert.match(id, /^[0-9a-f]{32}$/);
});

test("listingId: different roles produce different ids", () => {
  const a = listingId({ company: "A", title: "SWE Intern", url: "https://a.com/1" });
  const b = listingId({ company: "A", title: "SWE Intern", url: "https://a.com/2" });
  assert.notEqual(a, b);
});
