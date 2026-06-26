// Pure daily-digest scheduling helpers — no DB / side effects, so they're unit
// testable in isolation (kept out of index.ts, which imports prisma).

export function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// Decide whether a daily-digest preference is due right now.
//
// We fire on the first run at or after the configured hour each UTC day, rather
// than requiring an exact hour match. The scheduler (hourly GitHub Actions cron)
// can be delayed or skipped under load, so an exact-hour check could miss a
// user's slot entirely; "at or after, once per day" tolerates that.
export function digestDue(
  digestHour: number,
  lastDigestAt: Date | null,
  now: Date,
): boolean {
  if (now.getUTCHours() < digestHour) return false; // not yet their hour today
  if (lastDigestAt && sameUtcDay(lastDigestAt, now)) return false; // already today
  return true;
}
