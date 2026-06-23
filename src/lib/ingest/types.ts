import type { Category } from "@/generated/prisma/client";

// The common shape every source adapter must produce. One object per posting.
export interface NormalizedListing {
  id: string; // stable hash — see hash.ts
  source: string; // which source/repo it came from
  company: string;
  title: string;
  category: Category;
  locations: string[];
  applyUrl: string;
  sponsorship: string | null;
  season: string | null;
  datePosted: Date | null; // null when the source omits/zeroes it
  active: boolean;
}

// A data source = where to fetch + how to map its raw JSON into NormalizedListing[].
export interface Source {
  // Short stable key stored on each Listing.source (e.g. "vanshb03").
  name: string;
  // Raw JSON URL (we fetch raw files — no GitHub API auth needed).
  url: string;
  // Map this source's raw payload into the common schema.
  // Implementations should be defensive: repos drift, so validate fields.
  adapt: (raw: unknown) => NormalizedListing[];
}

// Per-source fetch/normalize stats. created/updated are computed at the run
// level (after cross-source dedup), so they live on IngestSummary instead.
export interface SourceResult {
  source: string;
  fetched: number; // raw rows pulled
  normalized: number; // rows after filtering (is_visible, recency, etc.)
  error?: string; // set if the source failed
}

// Outcome of a full ingest run across all sources.
export interface IngestSummary {
  sources: SourceResult[];
  collapsed: number; // duplicate rows merged across sources
  persisted: number; // distinct rows written (created + updated)
  created: number; // brand-new rows
  updated: number; // existing rows refreshed
  failedSources: number;
  durationMs: number;
}
