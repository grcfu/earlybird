// Which recruiting cycle a tracked application belongs to.
//
// A tracker that never forgets accumulates every cycle you've ever applied in,
// so last year's Summer 2026 hunt sits next to this year's Summer 2027 one. This
// derives the cycle from data already on the row — no schema change — using the
// same summer-year rule as the internships feed (see summerCycleOf), so a role
// and the application for it always land in the same cycle.
//
// Prisma-free so client components can import it.

import { summerCycleOf } from "@/lib/eligibility";

export interface Cycle {
  year: number; // the summer the internship is for, e.g. 2027
  estimated: boolean; // true when inferred from the date rather than stated
}

// An explicit year in the role beats any inference: "Software Engineer Intern -
// Python, Summer 2027" and "2026 - Industry Solutions Intern" say it outright.
// Otherwise fall back to when the application was submitted.
export function applicationCycle(
  role: string,
  appliedAt: string | null,
  eventDate: string,
): Cycle | null {
  const stated = role.match(/20\d{2}/)?.[0];
  if (stated) return { year: Number(stated), estimated: false };
  const d = new Date(appliedAt ?? eventDate);
  if (Number.isNaN(d.getTime())) return null;
  return { year: summerCycleOf(d), estimated: true };
}

// The cycle currently being recruited for.
export function currentCycle(now: Date = new Date()): number {
  return summerCycleOf(now);
}

export function cycleLabel(year: number): string {
  return `Summer ${year}`;
}

// How far apart two events can be and still plausibly belong to one application.
// A pipeline inside one season runs months, not a year; a re-application to the
// same company comes back around at ~12. 120 days sits comfortably between.
const STRADDLE_DAYS = 120;
const DAY_MS = 86_400_000;

// Do an existing application and an incoming email belong to the same cycle?
//
// Not simply "equal cycle year": the June boundary can fall in the middle of one
// application's correspondence — apply in May (Summer 2026), get rejected in June
// (Summer 2027) — and splitting that in two would be wrong. So a disagreement is
// only believed when the years were stated outright, or when the events are far
// enough apart to be separate seasons.
export function sameCycle(
  existing: { role: string; appliedAt: string | null; eventDate: string },
  incoming: { role: string; eventDate: string },
): boolean {
  const a = applicationCycle(existing.role, existing.appliedAt, existing.eventDate);
  const b = applicationCycle(incoming.role, incoming.eventDate, incoming.eventDate);
  // No usable date on either side — don't invent a distinction.
  if (!a || !b) return true;
  if (a.year === b.year) return true;
  // Both roles named their year and the years differ: a genuine re-application.
  if (!a.estimated && !b.estimated) return false;
  // Otherwise this may just be the boundary cutting through one application.
  const anchor = new Date(existing.appliedAt ?? existing.eventDate).getTime();
  const event = new Date(incoming.eventDate).getTime();
  if (Number.isNaN(anchor) || Number.isNaN(event)) return true;
  return Math.abs(event - anchor) / DAY_MS <= STRADDLE_DAYS;
}

// An application's cycle for display. Prefers the value stored on the row, which
// is what dedup keyed on; derives it only for rows written before the column
// existed (cycle 0).
export function cycleOf(app: {
  cycle: number;
  role: string;
  appliedAt: string | null;
  eventDate: string;
}): number | null {
  if (app.cycle > 0) return app.cycle;
  return applicationCycle(app.role, app.appliedAt, app.eventDate)?.year ?? null;
}

// Cycles present in a set of applications, newest first — the options to offer.
export function cyclesPresent(
  apps: {
    cycle: number;
    role: string;
    appliedAt: string | null;
    eventDate: string;
  }[],
): number[] {
  const years = new Set<number>();
  for (const a of apps) {
    const y = cycleOf(a);
    if (y != null) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}
