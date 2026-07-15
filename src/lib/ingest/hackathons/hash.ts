import { createHash } from "node:crypto";
import { normalizeText, urlHostPath } from "@/lib/ingest/hash";

// Stable, cross-source primary key for a hackathon.
//
// Like listingId, `source` is deliberately NOT part of the key: the same event
// listed on both MLH and Devpost hashes to one id so an upsert collapses them.
// Match = normalized name + registration URL host/path.
export function hackathonId(parts: { name: string; url: string }): string {
  const key = [normalizeText(parts.name), urlHostPath(parts.url)].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}
