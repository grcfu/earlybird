import type { NormalizedListing } from "@/lib/ingest/types";
import { Category } from "@/generated/prisma/client";

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

// Collapse listings across sources by id. Returns the merged set plus how many
// rows were absorbed (collapsed) by dedup, for logging.
export function mergeListings(
  listings: NormalizedListing[],
  priority: string[],
): { merged: NormalizedListing[]; collapsed: number } {
  const byId = new Map<string, NormalizedListing[]>();
  for (const l of listings) {
    const group = byId.get(l.id);
    if (group) group.push(l);
    else byId.set(l.id, [l]);
  }

  const merged: NormalizedListing[] = [];
  let collapsed = 0;
  for (const group of byId.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
    } else {
      collapsed += group.length - 1;
      merged.push(mergeGroup(group, priority));
    }
  }
  return { merged, collapsed };
}
