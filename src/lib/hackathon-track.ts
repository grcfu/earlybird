// Client-side hackathon-tracking model (localStorage; no DB, the feed is
// anonymous). Kept free of any server import so it's safe in the browser.
// Parallel to lib/track.ts, but with hackathon-appropriate states.

export type HackTrackStatus =
  | "interested"
  | "registered"
  | "submitted"
  | "not_interested";

export const HACK_TRACK_STATUSES: HackTrackStatus[] = [
  "interested",
  "registered",
  "submitted",
  "not_interested",
];

export const HACK_STATUS_LABEL: Record<HackTrackStatus, string> = {
  interested: "Interested",
  registered: "Registered",
  submitted: "Submitted",
  not_interested: "Not interested",
};

// Tailwind classes for the per-card status pill (same palette as the roles feed).
export const HACK_STATUS_CLASS: Record<HackTrackStatus, string> = {
  interested: "bg-accent-soft text-accent-ink",
  registered: "bg-leaf-soft text-leaf",
  submitted: "bg-leaf text-canvas",
  not_interested: "bg-mist text-ink-faint",
};

// "You committed to it" — registered or submitted. Drives the Registered tab
// and the streak-style counts.
export function isRegistered(s: HackTrackStatus | undefined): boolean {
  return s === "registered" || s === "submitted";
}

// "Something you're into" — an explicit Interested mark OR any registration.
export function isHackInterested(s: HackTrackStatus | undefined): boolean {
  return s === "interested" || isRegistered(s);
}
