import type { Source } from "@/lib/ingest/types";
import { vanshb03Source } from "@/lib/ingest/sources/vanshb03";
import { simplifySource } from "@/lib/ingest/sources/simplify";

// The single place to add/remove data sources.
//
// Order matters: when the same role appears in multiple sources, the merge step
// (lib/ingest/dedupe.ts) treats earlier entries as higher priority for fields
// like company/title casing and category.
//
// NOT INCLUDED: sndsh404/summer-2027-internships — that repo only ships an
// `internship_tracker.xlsx` (no structured listings.json), so there's nothing
// reliable to consume. Revisit if they publish a JSON feed.
export const sources: Source[] = [vanshb03Source, simplifySource];

// Source names in priority order, for the dedupe/merge step.
export const sourcePriority: string[] = sources.map((s) => s.name);
