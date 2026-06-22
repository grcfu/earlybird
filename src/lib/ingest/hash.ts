import { createHash } from "node:crypto";

// Stable primary key for a listing: a hash of source + company + title + url.
// Same posting from the same source always maps to the same id, so re-ingesting
// upserts the existing row instead of duplicating it.
export function listingId(parts: {
  source: string;
  company: string;
  title: string;
  url: string;
}): string {
  const normalized = [
    parts.source.trim().toLowerCase(),
    parts.company.trim().toLowerCase(),
    parts.title.trim().toLowerCase(),
    parts.url.trim().toLowerCase(),
  ].join("|");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}
