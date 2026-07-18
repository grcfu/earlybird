import type { ListingRow } from "@/lib/listings";
import { normalizeCompany } from "@/lib/apptracker/normalize";

// Loose title for grouping look-alike postings (multi-location / near-identical
// reruns of the same role). Strips punctuation, year/season, and unifies
// intern(ship).
function looseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(summer|fall|winter|spring)?\s*20\d\d\b/g, " ")
    .replace(/\bintern(ship)?\b/g, "intern")
    .replace(/\s+/g, " ")
    .trim();
}

export function feedGroupKey(company: string, title: string): string {
  return `${normalizeCompany(company)}|${looseTitle(title)}`;
}

export interface ListingGroup {
  // Representative row (the newest in the group) used for status, freshness,
  // and the primary apply link. Stable so tracking sticks to it.
  primary: ListingRow;
  members: ListingRow[]; // all rows in the group, incl. primary
  // Distinct (location, apply-URL) pairs across the group, for the card's
  // "N locations" expander.
  locations: { location: string; url: string }[];
}

// Collapse a feed page's rows into groups of the same company + role. Input is
// assumed newest-first; group order follows first appearance, so the feed stays
// newest-first. Each group's primary is the first (newest) member.
export function groupListings(listings: ListingRow[]): ListingGroup[] {
  const map = new Map<string, ListingRow[]>();
  const order: string[] = [];
  for (const l of listings) {
    const k = feedGroupKey(l.company, l.title);
    if (!map.has(k)) {
      map.set(k, []);
      order.push(k);
    }
    map.get(k)!.push(l);
  }

  return order.map((k) => {
    const members = map.get(k)!;
    const primary = members[0];
    const seen = new Set<string>();
    const locations: { location: string; url: string }[] = [];
    for (const m of members) {
      const location = m.locations[0] ?? "Location N/A";
      const dedupe = `${location}|${m.applyUrl}`.toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      locations.push({ location, url: m.applyUrl });
    }
    return { primary, members, locations };
  });
}
