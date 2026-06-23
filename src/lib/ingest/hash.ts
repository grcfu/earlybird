import { createHash } from "node:crypto";

// Collapse whitespace + lowercase, so trivial formatting differences between
// sources don't defeat dedup ("  Software   Engineer " === "software engineer").
export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// Reduce an apply URL to host + path (lowercased, www-stripped, no trailing
// slash, query/hash dropped). Two repos linking to the same posting usually
// share this even when tracking params differ.
export function urlHostPath(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.host.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return host + path;
  } catch {
    // Not a parseable URL — fall back to the normalized raw string.
    return normalizeText(rawUrl);
  }
}

// Stable, cross-source primary key for a listing.
//
// NOTE: `source` is intentionally NOT part of the key. The same role appearing
// in two repos hashes to the same id, so an upsert naturally collapses them into
// one Listing (the Phase 2 dedup requirement). Match = normalized company +
// normalized title + apply URL host/path.
export function listingId(parts: {
  company: string;
  title: string;
  url: string;
}): string {
  const key = [
    normalizeText(parts.company),
    normalizeText(parts.title),
    urlHostPath(parts.url),
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}
