// Pure matching logic: does a listing satisfy a preference's filters?
// (The firstSeenAt recency window is applied in the DB query; everything else
// is decided here so it can be unit-tested without a database.)

export interface MatchListing {
  category: string;
  title: string;
  locations: string[];
  active: boolean;
}

export interface MatchPreference {
  categories: string[]; // empty = all categories
  keywords: string[]; // empty = no keyword constraint; any-match
  locationsFilter: string[]; // empty = no location constraint; any-match
  activeOnly: boolean;
}

export function matchesPreference(
  listing: MatchListing,
  pref: MatchPreference,
): boolean {
  if (pref.activeOnly && !listing.active) return false;

  if (pref.categories.length > 0 && !pref.categories.includes(listing.category)) {
    return false;
  }

  if (pref.keywords.length > 0) {
    const title = listing.title.toLowerCase();
    const hit = pref.keywords.some((k) => title.includes(k.trim().toLowerCase()));
    if (!hit) return false;
  }

  if (pref.locationsFilter.length > 0) {
    const locs = listing.locations.map((l) => l.toLowerCase());
    const hit = pref.locationsFilter.some((f) => {
      const needle = f.trim().toLowerCase();
      return needle && locs.some((l) => l.includes(needle));
    });
    if (!hit) return false;
  }

  return true;
}
