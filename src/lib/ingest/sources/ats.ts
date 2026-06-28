import { listingId } from "@/lib/ingest/hash";
import { normalizeCategory } from "@/lib/ingest/categorize";
import { isInternship } from "@/lib/ingest/internship";
import { mapPool } from "@/lib/ingest/http";
import type { NormalizedListing } from "@/lib/ingest/types";

// One company on an ATS: a display name + the board identifier for that ATS.
export interface AtsCompany {
  company: string;
  token: string;
}

// A raw job pulled from a company's board, before the internship filter.
export interface AtsJob {
  title: string;
  locations: string[];
  url: string;
  datePosted: Date | null;
}

// Shared engine for every ATS provider source: fan out across the company
// registry with bounded concurrency, isolate per-company failures, filter to
// internships, and normalize. A live board listing is by definition open, so
// `active` is always true here.
export async function loadAts(opts: {
  sourceName: string;
  companies: AtsCompany[];
  fetchCompany: (c: AtsCompany) => Promise<AtsJob[]>;
  concurrency?: number;
}): Promise<{ listings: NormalizedListing[]; fetched: number }> {
  const { sourceName, companies, fetchCompany, concurrency = 8 } = opts;

  const settled = await mapPool(companies, concurrency, (c) => fetchCompany(c));

  const out: NormalizedListing[] = [];
  const seen = new Set<string>();
  let fetched = 0;
  let failures = 0;

  settled.forEach((r, i) => {
    const c = companies[i];
    if (r.status !== "fulfilled") {
      failures++;
      console.error(`[${sourceName}] ${c.company} (${c.token}) failed: ${r.reason}`);
      return;
    }
    for (const job of r.value) {
      fetched++;
      if (!job.url || !job.title) continue;
      if (!isInternship(job.title)) continue;
      const id = listingId({ company: c.company, title: job.title, url: job.url });
      if (seen.has(id)) continue; // collapse a board listing a role twice
      seen.add(id);
      out.push({
        id,
        source: sourceName,
        company: c.company,
        title: job.title,
        category: normalizeCategory(null, job.title),
        locations: job.locations.filter(Boolean),
        applyUrl: job.url,
        sponsorship: null,
        season: null,
        datePosted: job.datePosted,
        active: true,
      });
    }
  });

  console.log(
    `[${sourceName}] ${companies.length} companies (${failures} failed), ` +
      `${fetched} raw → ${out.length} internships`,
  );
  return { listings: out, fetched };
}

// Parse an ISO-ish date string defensively; null when unusable.
export function parseIsoDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
