// Client-side application-tracking model (persisted in localStorage; no DB, the
// feed is anonymous). Kept free of any server import so it's safe in the browser.

export type TrackStatus =
  | "interested"
  | "applied"
  | "interview"
  | "offer"
  | "rejected";

export const TRACK_STATUSES: TrackStatus[] = [
  "interested",
  "applied",
  "interview",
  "offer",
  "rejected",
];

export const STATUS_LABEL: Record<TrackStatus, string> = {
  interested: "Interested",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

// Tailwind classes for the per-card status pill.
export const STATUS_CLASS: Record<TrackStatus, string> = {
  interested: "bg-accent-soft text-accent-ink",
  applied: "bg-leaf-soft text-leaf",
  interview: "bg-accent text-canvas",
  offer: "bg-leaf text-canvas",
  rejected: "bg-danger/15 text-danger",
};

// "You actually submitted an application" — drives the Applied filter + counts.
export function isApplied(s: TrackStatus | undefined): boolean {
  return (
    s === "applied" || s === "interview" || s === "offer" || s === "rejected"
  );
}
