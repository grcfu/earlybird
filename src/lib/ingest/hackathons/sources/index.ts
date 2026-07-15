import type { HackathonSource } from "@/lib/ingest/hackathons/types";
import { mlhSource } from "@/lib/ingest/hackathons/sources/mlh";
import { devpostSource } from "@/lib/ingest/hackathons/sources/devpost";

// The single place to add/remove hackathon sources.
//
// MLH first: it's the cleaner, college-focused source, so its name/url/format
// win for any event that also appears elsewhere. Devpost fills in fields MLH
// lacks (prize pool, participant counts) during the merge.
//
// NOTE: cross-source dedup keys on name + registration-URL host/path. MLH and
// Devpost link to different hosts for the same event, so identical events across
// the two platforms won't always collapse — acceptable, since the platforms list
// largely disjoint events (MLH = collegiate in-person; Devpost = online/sponsor).
export const hackathonSources: HackathonSource[] = [mlhSource, devpostSource];

export const hackathonSourcePriority: string[] = hackathonSources.map((s) => s.name);
