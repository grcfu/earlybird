import type { HackathonFormat } from "@/generated/prisma/client";

// The common shape every hackathon source adapter produces. One per event.
export interface NormalizedHackathon {
  id: string; // stable hash — see hackathons/hash.ts
  source: string; // "mlh" | "devpost"
  name: string;
  url: string; // the event's own registration / website link
  format: HackathonFormat; // ONLINE | IN_PERSON | HYBRID
  locationLabel: string; // "Online" or "New York, NY"
  country: string | null; // in-person venue country (for US filtering); null if online/unknown
  startsAt: Date | null;
  endsAt: Date | null;
  dateLabel: string | null; // human range from the source
  prize: string | null; // prize-pool text, free-form
  themes: string[];
  participants: number | null; // registrations count when exposed
  imageUrl: string | null;
  active: boolean;
}

// A hackathon source = fetch + normalize its raw payload. Unlike the listing
// sources there's no simple-feed mode; both MLH and Devpost need custom parsing,
// so every source implements load() itself.
export interface HackathonSource {
  name: string;
  // Returns mapped events plus the raw count (before filtering) for the summary.
  load: () => Promise<{ hackathons: NormalizedHackathon[]; fetched: number }>;
}

// Per-source fetch/normalize stats.
export interface HackathonSourceResult {
  source: string;
  fetched: number;
  normalized: number;
  error?: string;
}

// Outcome of a full hackathon ingest run.
export interface HackathonIngestSummary {
  sources: HackathonSourceResult[];
  collapsed: number; // duplicates merged across sources
  persisted: number; // distinct rows written
  created: number;
  updated: number;
  deactivated: number;
  failedSources: number;
  durationMs: number;
}
