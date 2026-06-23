import { normalizeCategory } from "@/lib/ingest/categorize";
import { listingId } from "@/lib/ingest/hash";
import type { NormalizedListing, Source } from "@/lib/ingest/types";

/**
 * Source adapter: SimplifyJobs/Summer2026-Internships (branch `dev`).
 *
 * Raw row shape (inspected 2026-06; may drift — keep this comment in sync):
 *   {
 *     company_name: string,
 *     title: string,
 *     locations: string[],
 *     url: string,                 // apply link (usually the real ATS URL)
 *     date_posted: number,         // Unix SECONDS
 *     date_updated: number,
 *     active: boolean,
 *     is_visible: boolean,         // skip when false
 *     category: string,            // e.g. "Software", "AI/ML/Data", "Quant"
 *     sponsorship: string,
 *     terms: string[],             // e.g. ["Summer 2026"] — used as season hint
 *     degrees: string[],
 *     company_url: string
 *   }
 *
 * VOLUME NOTE: this repo carries ~16k listings, most long-dead. A real-time
 * "apply within hours" tracker only cares about live or fresh roles, so we keep
 * only rows that are `active` OR posted within RECENT_WINDOW_DAYS. This keeps the
 * DB focused and ingestion fast enough to run every 30 minutes on Neon.
 */

interface RawListing {
  company_name?: unknown;
  title?: unknown;
  locations?: unknown;
  url?: unknown;
  date_posted?: unknown;
  active?: unknown;
  is_visible?: unknown;
  category?: unknown;
  sponsorship?: unknown;
  terms?: unknown;
}

const SOURCE_NAME = "Simplify";
const RECENT_WINDOW_DAYS = 90;

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
    throw new Error("Simplify: expected a top-level JSON array");
  }

  const cutoff = Date.now() - RECENT_WINDOW_DAYS * 86_400_000;
  const out: NormalizedListing[] = [];

  for (const item of raw as RawListing[]) {
    if (item?.is_visible === false) continue;

    const company = asString(item?.company_name);
    const title = asString(item?.title);
    const url = asString(item?.url);
    if (!company || !title || !url) continue;

    const active = item?.active === true;
    const datePosted = unixSecondsToDate(item?.date_posted);

    // Keep only live roles or recently-posted ones (see VOLUME NOTE above).
    const recent = datePosted ? datePosted.getTime() >= cutoff : false;
    if (!active && !recent) continue;

    // SimplifyJobs encodes the season inside `terms` (e.g. "Summer 2026").
    const terms = asStringArray(item?.terms);
    const season = terms[0] ?? null;

    out.push({
      id: listingId({ company, title, url }),
      source: SOURCE_NAME,
      company,
      title,
      category: normalizeCategory(asString(item?.category), title),
      locations: asStringArray(item?.locations),
      applyUrl: url,
      sponsorship: asString(item?.sponsorship),
      season,
      datePosted,
      active,
    });
  }
  return out;
}

export const simplifySource: Source = {
  name: SOURCE_NAME,
  url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
  adapt,
};
