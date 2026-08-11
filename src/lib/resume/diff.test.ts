import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSegments, placeholdersIn } from "@/lib/resume/diff";

// Reassembling the segments must give back the revised string exactly —
// otherwise the toggle would display something the user never approved.
function rebuild(original: string, revised: string): string {
  return diffSegments(original, revised)
    .map((s) => s.text)
    .join("");
}

const added = (o: string, r: string) =>
  diffSegments(o, r)
    .filter((s) => s.kind === "added")
    .map((s) => s.text.trim())
    .filter(Boolean);

test("segments always reassemble into the revised text exactly", () => {
  const cases: [string, string][] = [
    ["Built a caching layer in Go.", "Designed a caching layer in Go."],
    ["", "Brand new bullet."],
    ["Only the original.", ""],
    ["same", "same"],
    ["  leading and trailing  ", " different  spacing "],
  ];
  for (const [o, r] of cases) {
    assert.equal(rebuild(o, r), r, `lost text for ${JSON.stringify([o, r])}`);
  }
});

test("only the changed words are marked added", () => {
  const marks = added(
    "Built a caching layer in Go that cut p99 latency by 40%.",
    "Designed a caching layer in Go that cut p99 latency by 40%.",
  );
  assert.deepEqual(marks, ["Designed"]);
});

test("an unchanged bullet marks nothing", () => {
  const s = "Wrote integration tests for the billing service.";
  assert.equal(added(s, s).length, 0);
});

test("a wholly new bullet is entirely added", () => {
  const segs = diffSegments("", "Accomplished X as measured by Y.");
  assert.ok(segs.every((s) => s.kind !== "same"));
});

test("inserted words in the middle are caught, not the whole tail", () => {
  const marks = added(
    "Wrote integration tests for the billing service.",
    "Wrote end-to-end integration tests for the billing service.",
  );
  assert.deepEqual(marks, ["end-to-end"]);
});

test("bracketed placeholders get their own kind", () => {
  const segs = diffSegments(
    "Wrote integration tests for the billing service.",
    "Wrote integration tests for the billing service using [Docker].",
  );
  const ph = segs.filter((s) => s.kind === "placeholder").map((s) => s.text);
  assert.deepEqual(ph, ["[Docker]"]);
});

test("a placeholder is flagged even inside otherwise unchanged text", () => {
  // The bracket rule is what stops a literal "[X]%" reaching a recruiter, so a
  // placeholder must never be styled as ordinary unchanged prose.
  const segs = diffSegments("Cut latency by 40%.", "Cut latency by [X]%.");
  assert.ok(segs.some((s) => s.kind === "placeholder" && s.text === "[X]"));
});

test("whitespace-only runs are never highlighted on their own", () => {
  // A highlighted gap between two unchanged words reads as a rendering bug.
  const segs = diffSegments("a b c", "a  b  c");
  assert.ok(!segs.some((s) => s.kind === "added" && s.text.trim() === ""));
});

test("reordering marks only what genuinely moved", () => {
  const marks = added("alpha beta gamma", "gamma alpha beta");
  // One "gamma" is new at the front; the trailing one is dropped, not shown.
  assert.deepEqual(marks, ["gamma"]);
});

test("placeholdersIn lists each distinct placeholder once, in order", () => {
  assert.deepEqual(
    placeholdersIn("Cut [X]% by adding [Kubernetes] and more [X]%"),
    ["[X]", "[Kubernetes]"],
  );
  assert.deepEqual(placeholdersIn("nothing bracketed here"), []);
});

test("a very long bullet still returns the revised text intact", () => {
  const o = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
  const r = Array.from({ length: 400 }, (_, i) => `x${i}`).join(" ");
  assert.equal(rebuild(o, r), r);
});
