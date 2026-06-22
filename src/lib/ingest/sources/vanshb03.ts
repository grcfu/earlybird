import { categorize } from "@/lib/ingest/categorize";
import { listingId } from "@/lib/ingest/hash";
import type { NormalizedListing, Source } from "@/lib/ingest/types";

/**
 * Source adapter: vanshb03/Summer2027-Internships (branch `dev`).
 *
 * Raw row shape (inspected 2026-06; may drift — keep this comment in sync):
 *   {
 *     company_name: string,
 *     title: string,
 *     locations: string[],
 *     url: string,                 // apply link
 *     date_posted: number,         // Unix SECONDS (0/absent => unknown)
 *     date_updated: number,
 *     active: boolean,
 *     is_visible: boolean,         // skip when false
 *     season: string,
 *     sponsorship: string,
 *     id: string,                  // source's own id (we compute our own hash)
 *     company_url: string
 *   }
 */

interface RawListing {
  company_name?: unknown;
  title?: unknown;
  locations?: unknown;
  url?: unknown;
  date_posted?: unknown;
  active?: unknown;
  is_visible?: unknown;
  season?: unknown;
  sponsorship?: unknown;
}

const SOURCE_NAME = "vanshb03";

// Convert Unix seconds to a Date, treating 0/NaN/absent as "unknown" (null).
function unixSecondsToDate(value: unknown): Date | null {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : null))
    .filter((v): v is string => !!v);
}

function adapt(raw: unknown): NormalizedListing[] {
  if (!Array.isArray(raw)) {
    throw new Error("vanshb03: expected a top-level JSON array");
  }

  const out: NormalizedListing[] = [];
  for (const item of raw as RawListing[]) {
    // Skip hidden rows — the source uses is_visible to soft-delete.
    if (item?.is_visible === false) continue;

    const company = asString(item?.company_name);
    const title = asString(item?.title);
    const url = asString(item?.url);
    // Without these three we can't make a stable id or a useful row.
    if (!company || !title || !url) continue;

    out.push({
      id: listingId({ source: SOURCE_NAME, company, title, url }),
      source: SOURCE_NAME,
      company,
      title,
      category: categorize(title),
      locations: asStringArray(item?.locations),
      applyUrl: url,
      sponsorship: asString(item?.sponsorship),
      season: asString(item?.season),
      datePosted: unixSecondsToDate(item?.date_posted),
      active: item?.active !== false, // default true unless explicitly false
    });
  }
  return out;
}

export const vanshb03Source: Source = {
  name: SOURCE_NAME,
  url: "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/.github/scripts/listings.json",
  adapt,
};
