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
