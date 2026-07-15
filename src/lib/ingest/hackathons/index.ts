import { prisma } from "@/lib/prisma";
import {
  hackathonSources,
  hackathonSourcePriority,
} from "@/lib/ingest/hackathons/sources";
import { mergeHackathons } from "@/lib/ingest/hackathons/dedupe";
import type {
  HackathonIngestSummary,
  HackathonSource,
  HackathonSourceResult,
  NormalizedHackathon,
} from "@/lib/ingest/hackathons/types";

// Pull + normalize one source. Failures are isolated so a single bad source
// can't abort the run.
async function loadSource(
  source: HackathonSource,
): Promise<{ result: HackathonSourceResult; hackathons: NormalizedHackathon[] }> {
  try {
    const { hackathons, fetched } = await source.load();
    return {
      result: { source: source.name, fetched, normalized: hackathons.length },
      hackathons,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest:hackathons] source "${source.name}" failed: ${message}`);
    return {
      result: { source: source.name, fetched: 0, normalized: 0, error: message },
      hackathons: [],
    };
  }
}

// 19 columns per row; keep chunks well under Postgres's 65535 bind-param cap.
const COLUMNS_PER_ROW = 19;
const UPSERT_CHUNK_ROWS = 1000;

// Bulk INSERT ... ON CONFLICT upsert. firstSeenAt + createdAt are set on insert
// and never overwritten; everything else refreshes from the incoming row.
async function bulkUpsert(
  rows: NormalizedHackathon[],
  runAt: Date,
): Promise<{ created: number; updated: number }> {
  if (rows.length === 0) return { created: 0, updated: 0 };

  const ids = rows.map((r) => r.id);
  const existing = (
    await prisma.$queryRawUnsafe<{ id: string }[]>(
      'SELECT id FROM "Hackathon" WHERE id = ANY($1)',
      ids,
    )
  ).map((r) => r.id);
  const existingIds = new Set(existing);
  const created = rows.filter((r) => !existingIds.has(r.id)).length;
  const updated = rows.length - created;

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_ROWS) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_ROWS);
    const valueTuples: string[] = [];
    const params: unknown[] = [];

    chunk.forEach((r, idx) => {
      const b = idx * COLUMNS_PER_ROW;
      // format gets an explicit enum cast; the rest bind positionally.
      valueTuples.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::"HackathonFormat",` +
          `$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},` +
          `$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},` +
          `$${b + 16},$${b + 17},$${b + 18},$${b + 19})`,
      );
      params.push(
        r.id,
        r.source,
        r.name,
        r.url,
        r.format,
        r.locationLabel,
        r.country,
        r.startsAt,
        r.endsAt,
        r.dateLabel,
        r.prize,
        r.themes,
        r.participants,
        r.imageUrl,
        runAt, // firstSeenAt
        runAt, // lastSeenAt
        r.active,
        runAt, // createdAt
        runAt, // updatedAt
      );
    });

    const sql =
      `INSERT INTO "Hackathon" ` +
      `(id, source, name, url, format, "locationLabel", country, "startsAt", "endsAt", ` +
      `"dateLabel", prize, themes, participants, "imageUrl", "firstSeenAt", "lastSeenAt", ` +
      `active, "createdAt", "updatedAt") ` +
      `VALUES ${valueTuples.join(",")} ` +
      `ON CONFLICT (id) DO UPDATE SET ` +
      `source = EXCLUDED.source, name = EXCLUDED.name, url = EXCLUDED.url, ` +
      `format = EXCLUDED.format, "locationLabel" = EXCLUDED."locationLabel", ` +
      `country = EXCLUDED.country, "startsAt" = EXCLUDED."startsAt", "endsAt" = EXCLUDED."endsAt", ` +
      `"dateLabel" = EXCLUDED."dateLabel", prize = EXCLUDED.prize, themes = EXCLUDED.themes, ` +
      `participants = EXCLUDED.participants, "imageUrl" = EXCLUDED."imageUrl", ` +
      `"lastSeenAt" = EXCLUDED."lastSeenAt", active = EXCLUDED.active, "updatedAt" = EXCLUDED."updatedAt"`;
    // firstSeenAt and createdAt are deliberately absent from the UPDATE set.

    await prisma.$executeRawUnsafe(sql, ...params);
  }

  return { created, updated };
}

// Mark events inactive once unseen for 2 days (dropped off every source). The
// grace tolerates a transient single-run source failure.
async function deactivateStale(): Promise<number> {
  const res = await prisma.$executeRawUnsafe(
    `UPDATE "Hackathon" SET active = false, "updatedAt" = now()
     WHERE active = true AND "lastSeenAt" < now() - interval '2 days'`,
  );
  return typeof res === "number" ? res : 0;
}

// Run a full hackathon ingest across all sources. Never throws — returns a
// summary even if some sources failed.
export async function ingestHackathons(): Promise<HackathonIngestSummary> {
  const start = Date.now();
  const runAt = new Date();

  const loaded = [];
  for (const source of hackathonSources) {
    loaded.push(await loadSource(source));
  }

  const all = loaded.flatMap((l) => l.hackathons);
  const { merged, collapsed } = mergeHackathons(all, hackathonSourcePriority);
  const { created, updated } = await bulkUpsert(merged, runAt);
  const deactivated = merged.length > 0 ? await deactivateStale() : 0;

  const summary: HackathonIngestSummary = {
    sources: loaded.map((l) => l.result),
    collapsed,
    persisted: merged.length,
    created,
    updated,
    deactivated,
    failedSources: loaded.filter((l) => l.result.error).length,
    durationMs: Date.now() - start,
  };

  for (const s of summary.sources) {
    console.log(
      s.error
        ? `[ingest:hackathons] ${s.source}: FAILED — ${s.error}`
        : `[ingest:hackathons] ${s.source}: fetched ${s.fetched}, normalized ${s.normalized}`,
    );
  }
  console.log(
    `[ingest:hackathons] merged ${all.length} → ${merged.length} rows ` +
      `(${collapsed} collapsed); ${created} new, ${updated} updated, ` +
      `${deactivated} deactivated in ${summary.durationMs}ms`,
  );

  return summary;
}
