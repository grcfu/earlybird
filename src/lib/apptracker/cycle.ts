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

// Cycles present in a set of applications, newest first — the options to offer.
export function cyclesPresent(
  apps: { role: string; appliedAt: string | null; eventDate: string }[],
): number[] {
  const years = new Set<number>();
  for (const a of apps) {
    const c = applicationCycle(a.role, a.appliedAt, a.eventDate);
    if (c) years.add(c.year);
  }
  return [...years].sort((a, b) => b - a);
}
