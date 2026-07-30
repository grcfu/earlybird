import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applicationCycle,
  currentCycle,
  cyclesPresent,
  cycleLabel,
} from "@/lib/apptracker/cycle";

// Grace's real tracker split cleanly at the June boundary: the July 2026 batch is
// the Summer 2027 hunt, everything from Aug 2025–Apr 2026 was Summer 2026.

test("a year stated in the role wins over the date", () => {
  assert.deepEqual(
    applicationCycle("Software Engineer Intern - Python, Summer 2027", "2026-07-15", "2026-07-15"),
    { year: 2027, estimated: false },
  );
  assert.deepEqual(
    applicationCycle("2026 - Industry Solutions Intern, ATX", "2025-11-25", "2025-11-25"),
    { year: 2026, estimated: false },
  );
});

test("without a stated year, the applied date decides", () => {
  // June onward belongs to next summer's cycle.
  assert.deepEqual(applicationCycle("", "2026-07-18", "2026-07-18"), {
    year: 2027,
    estimated: true,
  });
  assert.deepEqual(applicationCycle("", "2026-06-01", "2026-06-01"), {
    year: 2027,
    estimated: true,
  });
  // January–May belongs to the coming summer.
  assert.deepEqual(applicationCycle("", "2026-02-10", "2026-02-10"), {
    year: 2026,
    estimated: true,
  });
  assert.deepEqual(applicationCycle("", "2026-05-31", "2026-05-31"), {
    year: 2026,
    estimated: true,
  });
  // Late in the previous calendar year is still the same cycle as Jan–May after.
  assert.deepEqual(applicationCycle("", "2025-08-27", "2025-08-27"), {
    year: 2026,
    estimated: true,
  });
});

test("falls back to eventDate when there's no applied date", () => {
  assert.deepEqual(applicationCycle("", null, "2026-07-16"), {
    year: 2027,
    estimated: true,
  });
});

test("an unparseable date yields no cycle rather than a wrong one", () => {
  assert.equal(applicationCycle("", "not a date", "also not a date"), null);
});

test("currentCycle tracks the same June boundary", () => {
  assert.equal(currentCycle(new Date("2026-07-29T12:00:00Z")), 2027);
  assert.equal(currentCycle(new Date("2026-05-31T12:00:00Z")), 2026);
  assert.equal(currentCycle(new Date("2026-06-01T12:00:00Z")), 2027);
});

test("cyclesPresent lists each cycle once, newest first", () => {
  const apps = [
    { role: "", appliedAt: "2026-07-18", eventDate: "2026-07-18" }, // 2027
    { role: "", appliedAt: "2026-02-10", eventDate: "2026-02-10" }, // 2026
    { role: "", appliedAt: "2026-07-21", eventDate: "2026-07-21" }, // 2027 again
    { role: "2026 - Intern", appliedAt: "2025-11-25", eventDate: "2025-11-25" }, // 2026
  ];
  assert.deepEqual(cyclesPresent(apps), [2027, 2026]);
});

test("cycleLabel reads as a season", () => {
  assert.equal(cycleLabel(2027), "Summer 2027");
});
