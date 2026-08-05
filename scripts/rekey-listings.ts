// Re-key Listing rows after a change to how listingId() is computed.
//
// listingId() is a content hash, so changing its definition (this run: the
// url-path case fold in urlHostPath) silently orphans every existing row —
// ingest would insert the same postings under fresh ids, and because
// firstSeenAt is set on insert and never updated, the entire board would
// register as posted-today: effectiveAt resets, the feed's newest-first sort is
// meaningless for a day, and the digest treats thousands of old roles as new.
//
// So rewrite the ids in place instead. firstSeenAt, createdAt, effectiveAt and
// the SentNotification rows hanging off each listing all survive.
//
//   npx tsx scripts/rekey-listings.ts          # report only
//   npx tsx scripts/rekey-listings.ts --apply  # write
//
// Idempotent: rows already carrying their correct id are skipped, so a second
// run reports zero changes.

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { listingId } from "@/lib/ingest/hash";

const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.listing.findMany({
    select: {
      id: true,
      company: true,
      title: true,
      applyUrl: true,
      firstSeenAt: true,
      active: true,
    },
    orderBy: { firstSeenAt: "asc" }, // oldest first: it wins a collision
  });

  const correct = new Map<string, typeof rows>();
  let unchanged = 0;
  for (const r of rows) {
    const want = listingId({ company: r.company, title: r.title, url: r.applyUrl });
    if (want === r.id) unchanged++;
    correct.set(want, [...(correct.get(want) ?? []), r]);
  }

  // A group with >1 row is the duplicate the hash change is meant to collapse.
  // Keep the oldest row (truest firstSeenAt), fold the others into it.
  const renames: { from: string; to: string }[] = [];
  const merges: { keep: string; drop: string[]; company: string; title: string }[] = [];
  for (const [want, group] of correct) {
    const keeper = group.find((r) => r.id === want) ?? group[0];
    const losers = group.filter((r) => r !== keeper);
    if (keeper.id !== want) renames.push({ from: keeper.id, to: want });
    if (losers.length > 0) {
      merges.push({
        keep: keeper.id,
        drop: losers.map((r) => r.id),
        company: keeper.company,
        title: keeper.title,
      });
    }
  }

  console.log(`listings: ${rows.length}`);
  console.log(`  already correct: ${unchanged}`);
  console.log(`  to re-key:       ${renames.length}`);
  console.log(
    `  to merge away:   ${merges.reduce((n, m) => n + m.drop.length, 0)}` +
      ` (across ${merges.length} postings)`,
  );

  for (const m of merges.slice(0, 20)) {
    console.log(`    merge ${m.drop.length + 1} -> 1  ${m.company} — ${m.title}`);
  }
  if (merges.length > 20) console.log(`    … and ${merges.length - 20} more`);

  if (!APPLY) {
    console.log("\nreport only — re-run with --apply to write");
    return;
  }

  // Order matters. Delete the duplicates first, so a rename can never collide
  // with a row that is about to disappear. Their SentNotification rows go with
  // them (onDelete: Cascade) — the keeper's own notification history is what we
  // are preserving, and a duplicate's is about the same posting.
  const dropIds = merges.flatMap((m) => m.drop);
  if (dropIds.length > 0) {
    const deleted = await prisma.listing.deleteMany({ where: { id: { in: dropIds } } });
    console.log(`\ndeleted ${deleted.count} duplicate rows`);
  }

  // Two-phase rename via a temp prefix: an old id and a new id can belong to
  // different rows in the same set (id A wants B's id while B wants C's), so
  // renaming directly can transiently collide on the primary key.
  //
  // Batched, and deliberately so. Between this script running and the new hash
  // reaching the cron, whichever side runs second re-inserts every row it can't
  // find — so the window wants to be seconds, not the minutes that 2 * 8k
  // single-row round-trips to a hosted Postgres would take.
  const CHUNK = 500;
  for (const phase of ["to-tmp", "from-tmp"] as const) {
    for (let i = 0; i < renames.length; i += CHUNK) {
      const chunk = renames.slice(i, i + CHUNK);
      const params: string[] = [];
      const tuples = chunk.map((r, k) => {
        const [from, to] = phase === "to-tmp" ? [r.from, `tmp:${r.to}`] : [`tmp:${r.to}`, r.to];
        params.push(from, to);
        return `($${k * 2 + 1},$${k * 2 + 2})`;
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Listing" SET id = v.new_id FROM (VALUES ${tuples.join(",")}) ` +
          `AS v(old_id, new_id) WHERE "Listing".id = v.old_id`,
        ...params,
      );
    }
  }
  console.log(`re-keyed ${renames.length} rows`);

  const left = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM "Listing" WHERE id LIKE 'tmp:%'`,
  );
  if (Number(left[0].n) > 0) {
    throw new Error(`${left[0].n} rows stuck with a tmp: id — investigate before ingesting`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
