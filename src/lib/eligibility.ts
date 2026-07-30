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

// The summer a recruiting-season date belongs to. Postings and applications from
// June onward are for *next* summer; January–May are for the coming one. So June
// 2026 → Summer 2027. Shared by the feed and the application tracker so both
// agree on where one cycle ends and the next begins.
export function summerCycleOf(date: Date): number {
  const month = date.getUTCMonth() + 1; // 1–12
  return month >= 6 ? date.getUTCFullYear() + 1 : date.getUTCFullYear();
}

// Which summer cycle a role is for. Prefers an explicit year in the season or
// title; otherwise estimates from the posting date via summerCycleOf.
// `estimated` flags the date-inferred case so the UI can mark it "~".
export function listingCycle(
  season: string | null,
  title: string,
  effectiveAt: string,
): { year: number; estimated: boolean } | null {
  const fromSeason = season?.match(/20\d{2}/)?.[0];
  if (fromSeason) return { year: Number(fromSeason), estimated: false };
  const fromTitle = title.match(/20\d{2}/)?.[0];
  if (fromTitle) return { year: Number(fromTitle), estimated: false };
  const d = new Date(effectiveAt);
  if (Number.isNaN(d.getTime())) return null;
  return { year: summerCycleOf(d), estimated: true };
}
