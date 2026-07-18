import type { NormalizedListing } from "@/lib/ingest/types";
import { Category } from "@/generated/prisma/client";
import { urlHostPath } from "@/lib/ingest/hash";
import { normalizeCompany } from "@/lib/apptracker/normalize";

// A per-posting deep link contains an id token (long number / uuid / id-ish
// slug). Generic careers pages ("zipline.com/open-roles", greenhouse embed URLs
// whose job id lives in the query we drop) do NOT — and many different jobs
// share those, so we must never merge on them.
function hasIdToken(hostPath: string): boolean {
  return (
    /\d{4,}/.test(hostPath) ||
    /[0-9a-f]{8}-[0-9a-f]{4}/.test(hostPath) ||
    /\/[a-z0-9]*\d[a-z0-9]{5,}/i.test(hostPath)
  );
}

// Cross-source merge key: same company + same per-job deep link = same posting,
// even if two sources word the title differently. Returns null when the URL
// isn't a safe per-job link (then we fall back to the exact-id grouping, which
// keeps distinct titles separate).
function crossKey(company: string, url: string): string | null {
  const hp = urlHostPath(url);
  const slash = hp.indexOf("/");
  if (slash < 0 || hp.length - slash < 6) return null; // no real path
  if (!hasIdToken(hp)) return null;
  return `${normalizeCompany(company)}@@${hp}`;
}

// Merge a group of listings that share the same id (same logical role found in
// multiple sources, or the same source listing it twice) into one row.
function mergeGroup(
  group: NormalizedListing[],
  priority: string[],
): NormalizedListing {
  // Sort by source priority (lower index = higher priority) so the preferred
  // source wins for single-value fields like company/title casing.
  const rank = (s: string) => {
    const i = priority.indexOf(s);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sorted = [...group].sort((a, b) => rank(a.source) - rank(b.source));
  const primary = sorted[0];

  // Union locations across all sources, de-duplicated, order-stable.
  const locations = Array.from(
    new Set(sorted.flatMap((l) => l.locations)),
  );

  // Earliest known posting date (most accurate "when it went live").
  const datePosted = sorted
    .map((l) => l.datePosted)
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  // First non-null value, walking sources by priority.
  const firstDefined = (pick: (l: NormalizedListing) => string | null) =>
    sorted.map(pick).find((v) => v != null) ?? null;

  // First non-OTHER category by priority; OTHER only if everyone says OTHER.
  const category =
    sorted.map((l) => l.category).find((c) => c !== Category.OTHER) ??
    Category.OTHER;

  // Combined source label, e.g. "Simplify+vanshb03" (priority order, unique).
  const source = Array.from(new Set(sorted.map((l) => l.source))).join("+");

  return {
    id: primary.id,
    source,
    company: primary.company,
    title: primary.title,
    category,
    locations,
    applyUrl: primary.applyUrl,
    sponsorship: firstDefined((l) => l.sponsorship),
    season: firstDefined((l) => l.season),
    datePosted,
    // A role is active if ANY source still lists it as active.
    active: sorted.some((l) => l.active),
  };
}

// Collapse listings across sources. Two rows merge when they share the exact id
// (same company+title+url) OR the same guarded cross-source key (same company +
// per-job deep link, so an aggregator copy with a reworded title folds into the
// direct posting). Returns the merged set plus how many rows were absorbed.
export function mergeListings(
  listings: NormalizedListing[],
  priority: string[],
): { merged: NormalizedListing[]; collapsed: number } {
  const groups = new Map<string, NormalizedListing[]>();
  for (const l of listings) {
    const key = crossKey(l.company, l.applyUrl) ?? `id:${l.id}`;
    const group = groups.get(key);
    if (group) group.push(l);
    else groups.set(key, [l]);
  }

  const merged: NormalizedListing[] = [];
  let collapsed = 0;
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
    } else {
      collapsed += group.length - 1;
      merged.push(mergeGroup(group, priority));
    }
  }
  return { merged, collapsed };
}
