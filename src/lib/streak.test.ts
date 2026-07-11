import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStreak } from "@/lib/streak";

const TODAY = "2026-07-11";

test("empty history → no streak", () => {
  assert.deepEqual(computeStreak([], TODAY), {
    count: 0,
    appliedToday: false,
    best: 0,
  });
});

test("applied today + prior consecutive days", () => {
  const s = computeStreak(["2026-07-09", "2026-07-10", "2026-07-11"], TODAY);
  assert.equal(s.count, 3);
  assert.equal(s.appliedToday, true);
  assert.equal(s.best, 3);
});

test("applied yesterday but not today → streak alive, today pending", () => {
  const s = computeStreak(["2026-07-09", "2026-07-10"], TODAY);
  assert.equal(s.count, 2);
  assert.equal(s.appliedToday, false);
});

test("gap yesterday → streak broken", () => {
  const s = computeStreak(["2026-07-08", "2026-07-09"], TODAY);
  assert.equal(s.count, 0);
  assert.equal(s.appliedToday, false);
});

test("duplicate dates count once", () => {
  const s = computeStreak(["2026-07-11", "2026-07-11", "2026-07-10"], TODAY);
  assert.equal(s.count, 2);
});

test("best reflects the longest past run, not the current one", () => {
  // A 4-day run in the past, then a broken gap, then just today.
  const s = computeStreak(
    ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-07-11"],
    TODAY,
  );
  assert.equal(s.count, 1);
  assert.equal(s.best, 4);
});

test("full ISO timestamps are truncated to the day", () => {
  const s = computeStreak(["2026-07-11T14:30:00.000Z"], TODAY);
  assert.equal(s.count, 1);
  assert.equal(s.appliedToday, true);
});
