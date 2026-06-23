// Recency rule (single source of truth).
//
// "How new is this?" uses the source's datePosted when it's present and sane,
// otherwise our own firstSeenAt observation time. We treat a datePosted that is
// missing, zero, or in the future (a backfill/clock artifact) as unusable.
//
// NOTE on the spec's "within ~30 days, else firstSeenAt" clause: we deliberately
// do NOT bounce genuinely-old-but-valid datePosted values to firstSeenAt. Doing
// so would make every historical role from a bulk source look brand-new on first
// ingest and flood the recency views. Real posting time drives recency; missing/
// bogus dates fall back to firstSeenAt. firstSeenAt is always stored + exposed.
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000; // allow 1d of clock skew

export function effectiveDate(input: {
  datePosted: Date | null;
  firstSeenAt: Date;
  now?: Date;
}): Date {
  const now = (input.now ?? new Date()).getTime();
  if (
    input.datePosted &&
    input.datePosted.getTime() <= now + FUTURE_TOLERANCE_MS
  ) {
    return input.datePosted;
  }
  return input.firstSeenAt;
}

// The recency windows offered in the UI. `null` hours = "all time".
export const RECENCY_WINDOWS = {
  "24h": 24,
  "2d": 48,
  "7d": 168,
  all: null,
} as const;

export type RecencyWindow = keyof typeof RECENCY_WINDOWS;
export const DEFAULT_WINDOW: RecencyWindow = "2d";

export function isRecencyWindow(value: unknown): value is RecencyWindow {
  return typeof value === "string" && value in RECENCY_WINDOWS;
}

// Cutoff Date for a window, or null for "all time".
export function windowCutoff(window: RecencyWindow, now = new Date()): Date | null {
  const hours = RECENCY_WINDOWS[window];
  if (hours == null) return null;
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}
