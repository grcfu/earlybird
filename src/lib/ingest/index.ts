import { prisma } from "@/lib/prisma";
import { sources } from "@/lib/ingest/sources";
import type { IngestResult, NormalizedListing, Source } from "@/lib/ingest/types";

// Fetch a source's raw JSON. Kept separate so it's easy to add ETag caching later.
async function fetchRaw(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "earlybird-ingest" },
    // Always pull fresh data on an ingest run.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Run upserts in small concurrent chunks so a full source (~hundreds of rows)
// doesn't open hundreds of connections at once against Neon.
async function chunked<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// Upsert one source's listings. firstSeenAt is set only on insert; lastSeenAt
// and the mutable fields are refreshed every run.
async function persist(
  listings: NormalizedListing[],
  runAt: Date,
): Promise<{ created: number; updated: number }> {
  // Which of these ids already exist? One query, then partition for counting.
  const ids = listings.map((l) => l.id);
  const existing = await prisma.listing.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));

  let created = 0;
  let updated = 0;

  await chunked(listings, 10, async (l) => {
    await prisma.listing.upsert({
      where: { id: l.id },
      create: {
        id: l.id,
        source: l.source,
        company: l.company,
        title: l.title,
        category: l.category,
        locations: l.locations,
        applyUrl: l.applyUrl,
        sponsorship: l.sponsorship,
        season: l.season,
        datePosted: l.datePosted,
        firstSeenAt: runAt,
        lastSeenAt: runAt,
        active: l.active,
      },
      update: {
        // Refresh fields that can legitimately change upstream.
        company: l.company,
        title: l.title,
        category: l.category,
        locations: l.locations,
        applyUrl: l.applyUrl,
        sponsorship: l.sponsorship,
        season: l.season,
        datePosted: l.datePosted,
        active: l.active,
        lastSeenAt: runAt,
        // NOTE: firstSeenAt is intentionally never updated.
      },
    });
    if (existingIds.has(l.id)) updated++;
    else created++;
  });

  return { created, updated };
}

// Ingest a single source, isolating failures so one bad source can't abort the run.
async function ingestSource(source: Source, runAt: Date): Promise<IngestResult> {
  try {
    const raw = await fetchRaw(source.url);
    const normalized = source.adapt(raw);
    const fetched = Array.isArray(raw) ? raw.length : 0;
    const { created, updated } = await persist(normalized, runAt);
    return {
      source: source.name,
      fetched,
      normalized: normalized.length,
      created,
      updated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] source "${source.name}" failed: ${message}`);
    return {
      source: source.name,
      fetched: 0,
      normalized: 0,
      created: 0,
      updated: 0,
      error: message,
    };
  }
}

// Ingest every configured source. Never throws — returns a per-source report.
export async function ingestAll(): Promise<IngestResult[]> {
  const runAt = new Date();
  const results: IngestResult[] = [];
  for (const source of sources) {
    const result = await ingestSource(source, runAt);
    results.push(result);
    if (result.error) {
      console.log(`[ingest] ${result.source}: FAILED — ${result.error}`);
    } else {
      console.log(
        `[ingest] ${result.source}: fetched ${result.fetched}, ` +
          `normalized ${result.normalized}, new ${result.created}, updated ${result.updated}`,
      );
    }
  }
  return results;
}
