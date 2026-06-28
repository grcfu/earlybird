// ─────────────────────────────────────────────────────────────────────────
// Your graduation date. This single constant drives internship-cycle
// eligibility everywhere. Update it if your grad date ever changes.
// ─────────────────────────────────────────────────────────────────────────
export const GRAD_YEAR = 2028;
export const GRAD_MONTH = 5; // 1–12 (May)

// Which internship summers you can still take, computed from today + grad date.
// A spring/early grad (≤ June) can intern through Summer (gradYear − 1); a
// fall/winter grad can intern through Summer (gradYear), since they're still a
// student that summer. We also drop summers already in the past relative to
// `now`, so the eligible set narrows automatically as cycles pass — no edits.
//
// e.g. grad May 2028, today mid-2026 → [2026, 2027]; a year later → [2027].
export function eligibleSummerYears(now: Date): number[] {
  const lastSummer = GRAD_MONTH <= 6 ? GRAD_YEAR - 1 : GRAD_YEAR;
  const firstSummer = now.getUTCFullYear();
  const years: number[] = [];
  for (let y = firstSummer; y <= lastSummer; y++) years.push(y);
  return years;
}
