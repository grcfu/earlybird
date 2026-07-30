import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applicationCycle,
  currentCycle,
  cyclesPresent,
  cycleLabel,
  cycleOf,
  sameCycle,
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
    { cycle: 2027, role: "", appliedAt: "2026-07-18", eventDate: "2026-07-18" },
    { cycle: 2026, role: "", appliedAt: "2026-02-10", eventDate: "2026-02-10" },
    { cycle: 2027, role: "", appliedAt: "2026-07-21", eventDate: "2026-07-21" },
    // cycle 0 = written before the column existed, so it's derived instead.
    { cycle: 0, role: "2026 - Intern", appliedAt: "2025-11-25", eventDate: "2025-11-25" },
  ];
  assert.deepEqual(cyclesPresent(apps), [2027, 2026]);
});

test("cycleOf prefers the stored value over re-deriving it", () => {
  // The stored value is what dedup keyed on, so display must agree with it even
  // if the derivation would now say something else.
  assert.equal(
    cycleOf({ cycle: 2027, role: "", appliedAt: "2026-02-10", eventDate: "2026-02-10" }),
    2027,
  );
  // cycle 0 means "not set" — fall back to deriving.
  assert.equal(
    cycleOf({ cycle: 0, role: "", appliedAt: "2026-02-10", eventDate: "2026-02-10" }),
    2026,
  );
});

test("cycleLabel reads as a season", () => {
  assert.equal(cycleLabel(2027), "Summer 2027");
});

// sameCycle decides whether an incoming email joins an existing application or
// starts a new one. Getting it wrong either way is bad: too eager and a
// re-application inherits last season's outcome; too strict and one
// application's mail splits in two across the June boundary.

test("mail about the same application joins it", () => {
  const existing = { role: "", appliedAt: "2026-01-09", eventDate: "2026-01-09" };
  assert.ok(sameCycle(existing, { role: "", eventDate: "2026-01-23" }));
  assert.ok(sameCycle(existing, { role: "", eventDate: "2026-03-01" }));
});

test("re-applying to the same company a year later is a new cycle", () => {
  // Grace's Google case: applied Aug 2025 and rejected, applied again Jul 2026.
  const lastSeason = { role: "", appliedAt: "2025-08-27", eventDate: "2025-09-15" };
  assert.ok(!sameCycle(lastSeason, { role: "", eventDate: "2026-07-20" }));
});

test("an application straddling the June boundary is NOT split", () => {
  // Applied in May (Summer 2026), rejected in June (would compute Summer 2027).
  // The cycles disagree but it's plainly one application.
  const applied = { role: "", appliedAt: "2026-05-20", eventDate: "2026-05-20" };
  assert.ok(sameCycle(applied, { role: "", eventDate: "2026-06-10" }));
  // Far enough past the boundary and it really is the next season.
  assert.ok(!sameCycle(applied, { role: "", eventDate: "2026-11-01" }));
});

test("stated years that disagree are believed even when close together", () => {
  // Two MongoDB roles in different cycles, applied weeks apart.
  const y2026 = {
    role: "2026 - Industry Solutions Intern, ATX",
    appliedAt: "2025-11-25",
    eventDate: "2025-11-25",
  };
  assert.ok(
    !sameCycle(y2026, {
      role: "Software Engineering Internship - Summer 2027",
      eventDate: "2025-12-10",
    }),
  );
});

test("an unstated year defers to the date gap, not to the stated side", () => {
  // An ACK with no role, then a rejection naming a 2027 role days later — one
  // application, where the later email simply supplies the missing year.
  const ack = { role: "", appliedAt: "2026-04-02", eventDate: "2026-04-02" };
  assert.ok(sameCycle(ack, { role: "Summer 2027 Intern", eventDate: "2026-04-09" }));
});

test("an unparseable date never splits an application", () => {
  const existing = { role: "", appliedAt: null, eventDate: "nonsense" };
  assert.ok(sameCycle(existing, { role: "", eventDate: "2026-07-01" }));
});
