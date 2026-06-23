import { prisma } from "@/lib/prisma";
import { sources, sourcePriority } from "@/lib/ingest/sources";
import { mergeListings } from "@/lib/ingest/dedupe";
import { effectiveDate } from "@/lib/recency";
import type {
  IngestSummary,
  NormalizedListing,
  Source,
  SourceResult,
} from "@/lib/ingest/types";

// Fetch a source's raw JSON. Separate so ETag caching can slot in later.
async function fetchRaw(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "earlybird-ingest" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Pull + normalize one source. Failures are caught so a single bad source can't
// abort the whole run (we still ingest the others).
async function loadSource(
  source: Source,
): Promise<{ result: SourceResult; listings: NormalizedListing[] }> {
  try {
    const raw = await fetchRaw(source.url);
    const listings = source.adapt(raw);
    return {
      result: {
        source: source.name,
        fetched: Array.isArray(raw) ? raw.length : 0,
        normalized: listings.length,
      },
      listings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] source "${source.name}" failed: ${message}`);
    return {
      result: { source: source.name, fetched: 0, normalized: 0, error: message },
      listings: [],
    };
  }
}

// 16 columns per row; Postgres caps a statement at 65535 bind params, so keep
// chunks well under 65535/16 ≈ 4095 rows.
const COLUMNS_PER_ROW = 16;
const UPSERT_CHUNK_ROWS = 1000;

// Bulk INSERT ... ON CONFLICT upsert. firstSeenAt + createdAt are set on insert
// and never overwritten; everything else is refreshed from the incoming row.
async function bulkUpsert(
  rows: NormalizedListing[],
  runAt: Date,
): Promise<{ created: number; updated: number }> {
  if (rows.length === 0) return { created: 0, updated: 0 };

  // Which ids already exist? Determines created-vs-updated counts.
  const ids = rows.map((r) => r.id);
  const existing = (await prisma.$queryRawUnsafe<{ id: string }[]>(
    'SELECT id FROM "Listing" WHERE id = ANY($1)',
    ids,
  )).map((r) => r.id);
  const existingIds = new Set(existing);
  const created = rows.filter((r) => !existingIds.has(r.id)).length;
  const updated = rows.length - created;

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_ROWS) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_ROWS);
    const valueTuples: string[] = [];
    const params: unknown[] = [];

    chunk.forEach((r, idx) => {
      const b = idx * COLUMNS_PER_ROW;
      // category gets an explicit enum cast; the rest bind positionally.
      valueTuples.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::"Category",` +
          `$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},` +
          `$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16})`,
      );
      params.push(
        r.id,
        r.source,
        r.company,
        r.title,
        r.category,
        r.locations,
        r.applyUrl,
        r.sponsorship,
        r.season,
        r.datePosted,
        runAt, // firstSeenAt
        runAt, // lastSeenAt
        r.active,
        // effectiveAt for a new row: datePosted (if sane) else firstSeenAt=runAt.
        effectiveDate({ datePosted: r.datePosted, firstSeenAt: runAt, now: runAt }),
        runAt, // createdAt
        runAt, // updatedAt
      );
    });

    const sql =
      `INSERT INTO "Listing" ` +
      `(id, source, company, title, category, locations, "applyUrl", sponsorship, ` +
      `season, "datePosted", "firstSeenAt", "lastSeenAt", active, "effectiveAt", "createdAt", "updatedAt") ` +
      `VALUES ${valueTuples.join(",")} ` +
      `ON CONFLICT (id) DO UPDATE SET ` +
      `source = EXCLUDED.source, company = EXCLUDED.company, title = EXCLUDED.title, ` +
      `category = EXCLUDED.category, locations = EXCLUDED.locations, "applyUrl" = EXCLUDED."applyUrl", ` +
      `sponsorship = EXCLUDED.sponsorship, season = EXCLUDED.season, "datePosted" = EXCLUDED."datePosted", ` +
      `"lastSeenAt" = EXCLUDED."lastSeenAt", active = EXCLUDED.active, "updatedAt" = EXCLUDED."updatedAt", ` +
      // Recompute effectiveAt against the PRESERVED firstSeenAt on update.
      `"effectiveAt" = CASE WHEN EXCLUDED."datePosted" IS NOT NULL ` +
      `AND EXCLUDED."datePosted" <= now() + interval '1 day' ` +
      `THEN EXCLUDED."datePosted" ELSE "Listing"."firstSeenAt" END`;
    // firstSeenAt and createdAt are deliberately absent from the UPDATE set.

    await prisma.$executeRawUnsafe(sql, ...params);
  }

  return { created, updated };
}

// Run a full ingest: load every source, merge across sources, bulk-upsert.
// Never throws — returns a summary even if some sources failed.
export async function ingestAll(): Promise<IngestSummary> {
  const start = Date.now();
  const runAt = new Date();

  // Load sources sequentially to be polite to GitHub raw hosting.
  const loaded = [];
  for (const source of sources) {
    loaded.push(await loadSource(source));
  }

  const allListings = loaded.flatMap((l) => l.listings);
  const { merged, collapsed } = mergeListings(allListings, sourcePriority);
  const { created, updated } = await bulkUpsert(merged, runAt);

  const summary: IngestSummary = {
    sources: loaded.map((l) => l.result),
    collapsed,
    persisted: merged.length,
    created,
    updated,
    failedSources: loaded.filter((l) => l.result.error).length,
    durationMs: Date.now() - start,
  };

  for (const s of summary.sources) {
    console.log(
      s.error
        ? `[ingest] ${s.source}: FAILED — ${s.error}`
        : `[ingest] ${s.source}: fetched ${s.fetched}, normalized ${s.normalized}`,
    );
  }
  console.log(
    `[ingest] merged ${allListings.length} → ${merged.length} rows ` +
      `(${collapsed} cross-source dupes collapsed); ` +
      `${created} new, ${updated} updated in ${summary.durationMs}ms`,
  );

  return summary;
}
