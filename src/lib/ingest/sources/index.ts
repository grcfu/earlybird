import type { Source } from "@/lib/ingest/types";
import { vanshb03Source } from "@/lib/ingest/sources/vanshb03";
import { simplifySource } from "@/lib/ingest/sources/simplify";
import { greenhouseSource } from "@/lib/ingest/sources/greenhouse";
import { leverSource } from "@/lib/ingest/sources/lever";
import { ashbySource } from "@/lib/ingest/sources/ashby";
import { workdaySource } from "@/lib/ingest/sources/workday";
import { smartRecruitersSource } from "@/lib/ingest/sources/smartrecruiters";
import { amazonSource } from "@/lib/ingest/sources/amazon";

// The single place to add/remove data sources.
//
// Order matters: when the same role appears in multiple sources, the merge step
// (lib/ingest/dedupe.ts) treats earlier entries as higher priority for fields
// like company/title casing and the apply URL. We put the direct-from-company
// ATS sources FIRST so their canonical apply links + fresh post dates win over
// the aggregator copies (which lag by days). datePosted always merges to the
// earliest known across sources, so the truest "went live" time is kept.
//
// NOT INCLUDED: sndsh404/summer-2027-internships — only ships an xlsx (no JSON).
// Google careers + Phenom-based boards (e.g. Capital One) have no clean public
// JSON endpoint and would need fragile per-site scrapers — deferred.
export const sources: Source[] = [
  // Direct ATS (company source of truth, freshest):
  greenhouseSource,
  leverSource,
  ashbySource,
  workdaySource,
  smartRecruitersSource,
  amazonSource,
  // Community aggregators (broad, but lag):
  vanshb03Source,
  simplifySource,
];

// Source names in priority order, for the dedupe/merge step.
export const sourcePriority: string[] = sources.map((s) => s.name);
