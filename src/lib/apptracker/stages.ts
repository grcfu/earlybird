// Presentation + ordering for application stages. Kept Prisma-free (like
// categories.ts) so client components can import it without pulling in the DB
// client. Keys mirror the Prisma AppStage enum values.

export type AppStageKey =
  | "APPLIED"
  | "ASSESSMENT"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTED";

export const STAGE_ORDER: AppStageKey[] = [
  "APPLIED",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
];

// Progression rank — used to decide whether a newly-seen email should advance a
// tracked application's stage (a later email never *downgrades* it). Offer and
// rejected are terminal outcomes, so they share the top rank.
export const STAGE_RANK: Record<AppStageKey, number> = {
  APPLIED: 1,
  ASSESSMENT: 2,
  INTERVIEW: 3,
  OFFER: 5,
  REJECTED: 5,
};

export const STAGE_LABEL: Record<AppStageKey, string> = {
  APPLIED: "Applied",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
};

export const STAGE_CLASS: Record<AppStageKey, string> = {
  APPLIED: "bg-accent-soft text-accent-ink",
  ASSESSMENT: "bg-mist text-ink-soft",
  INTERVIEW: "bg-accent text-canvas",
  OFFER: "bg-leaf text-canvas",
  REJECTED: "bg-danger/15 text-danger",
};

// Map the classifier's lowercase stage onto the enum key. Returns null for an
// unrecognized value.
export function toStageKey(s: string | null | undefined): AppStageKey | null {
  if (!s) return null;
  const up = s.toUpperCase();
  return (STAGE_ORDER as string[]).includes(up) ? (up as AppStageKey) : null;
}

// One stage on an application's timeline: an email that was classified, or a
// stage the user added by hand.
export interface StageEvent {
  stage: AppStageKey;
  date: string; // ISO
}

// The stage a set of timeline events adds up to: the furthest one by rank, ties
// going to the later date — the same rule ingest uses to advance a row, so a
// stage recomputed from the timeline agrees with one built up email by email.
// Null for an empty timeline.
export function stageFromTimeline(events: StageEvent[]): StageEvent | null {
  let best: StageEvent | null = null;
  for (const e of events) {
    if (
      !best ||
      STAGE_RANK[e.stage] > STAGE_RANK[best.stage] ||
      (STAGE_RANK[e.stage] === STAGE_RANK[best.stage] && e.date > best.date)
    ) {
      best = e;
    }
  }
  return best;
}

// The first date each stage was reached, for the export's per-stage columns.
// Only stages at or below the application's current rank count: when a stage was
// corrected downwards (a "your interview" email that was really a newsletter),
// the stale event shouldn't still fill an Interview column.
export function stageDates(
  current: AppStageKey,
  events: StageEvent[],
): Partial<Record<AppStageKey, string>> {
  const out: Partial<Record<AppStageKey, string>> = {};
  for (const e of events) {
    if (STAGE_RANK[e.stage] > STAGE_RANK[current]) continue;
    const seen = out[e.stage];
    if (!seen || e.date < seen) out[e.stage] = e.date;
  }
  return out;
}
