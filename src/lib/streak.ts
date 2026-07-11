// Daily "apply streak" — consecutive days you've marked at least one role
// Applied. Computed from the appliedAt dates (YYYY-MM-DD) we already store, so
// there's no extra state. Pure + client/server-safe for easy testing.

export interface StreakInfo {
  count: number; // length of the current streak (0 if broken)
  appliedToday: boolean; // did today already count?
  best: number; // longest streak ever recorded
}

// Shift a YYYY-MM-DD date by whole days (UTC, so no timezone drift).
function shiftDay(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

export function computeStreak(
  appliedDates: Iterable<string>,
  today: string,
): StreakInfo {
  const set = new Set<string>();
  for (const d of appliedDates) if (d) set.add(d.slice(0, 10));

  const appliedToday = set.has(today);

  // The streak is alive if you applied today OR yesterday (today still pending).
  // Walk backwards from that anchor while days are consecutive.
  const yesterday = shiftDay(today, -1);
  let anchor: string | null = appliedToday
    ? today
    : set.has(yesterday)
      ? yesterday
      : null;
  let count = 0;
  while (anchor && set.has(anchor)) {
    count++;
    anchor = shiftDay(anchor, -1);
  }

  // Longest run across all recorded days.
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...set].sort()) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }

  return { count, appliedToday, best };
}
