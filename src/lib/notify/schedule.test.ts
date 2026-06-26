import { test } from "node:test";
import assert from "node:assert/strict";
import { digestDue, sameUtcDay } from "@/lib/notify/schedule";

// Helper: a UTC Date at the given hour on 2026-06-25.
const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 5, 25, hour, minute));

test("not due before the configured hour", () => {
  assert.equal(digestDue(8, null, at(7)), false);
  assert.equal(digestDue(8, null, at(0)), false);
});

test("due exactly at the configured hour (never sent)", () => {
  assert.equal(digestDue(8, null, at(8)), true);
});

test("due at any run after the configured hour (handles delayed/skipped cron)", () => {
  // The 08:00 run was skipped; the 09:00 run should still fire it.
  assert.equal(digestDue(8, null, at(9)), true);
  assert.equal(digestDue(8, null, at(23)), true);
});

test("not due again once already sent earlier the same UTC day", () => {
  const sentAt8 = at(8);
  assert.equal(digestDue(8, sentAt8, at(9)), false);
  assert.equal(digestDue(8, sentAt8, at(23)), false);
});

test("due again the next UTC day", () => {
  const sentYesterday = new Date(Date.UTC(2026, 5, 24, 8));
  assert.equal(digestDue(8, sentYesterday, at(8)), true);
});

test("digestHour 0 fires on the first run of the day", () => {
  assert.equal(digestDue(0, null, at(0)), true);
  assert.equal(digestDue(0, at(0), at(1)), false); // already sent today
});

test("sameUtcDay compares calendar day in UTC", () => {
  assert.equal(sameUtcDay(at(0), at(23)), true);
  assert.equal(
    sameUtcDay(at(8), new Date(Date.UTC(2026, 5, 26, 8))),
    false,
  );
});
