// Populate Listing.country for rows that predate the column.
//
// The 20260806160000_listing_country migration adds it as NULL, and NULL means
// "kept" to the feed's US-only rule — so until this runs, every existing row is
// visible regardless of where it is. That's the same behaviour as before the
// change, not a regression, but it's also the whole point of the change.
//
//   npx tsx scripts/backfill-country.ts          # report only
//   npx tsx scripts/backfill-country.ts --apply  # write
//
// Text-only, deliberately: the authoritative country from Lever/Ashby/
// SmartRecruiters isn't stored on the row, so all this can do is read the
// location strings. The next ingest overwrites country with the reported value
// wherever a provider gives one, so this is a floor rather than a final answer.
//
// Idempotent: re-running recomputes the same values and reports zero changes.

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { inferCountry } from "@/lib/ingest/country";

const APPLY = process.argv.includes("--apply");
const CHUNK = 1000;

async function main() {
  const rows = await prisma.listing.findMany({
    select: { id: true, locations: true, country: true, company: true, title: true },
  });

  const updates: { id: string; country: string }[] = [];
  let unchanged = 0;
  let unknown = 0;
  const tally = new Map<string, number>();
  for (const r of rows) {
    const c = inferCountry(r.locations);
    if (c === null) {
      unknown++;
      continue; // leave NULL — we have nothing better to say
    }
    tally.set(c, (tally.get(c) ?? 0) + 1);
    if (c === r.country) {
      unchanged++;
      continue;
    }
    updates.push({ id: r.id, country: c });
  }

  console.log(`listings: ${rows.length}`);
  console.log(`  already correct:      ${unchanged}`);
  console.log(`  to set:               ${updates.length}`);
  console.log(`  no readable location: ${unknown}  (left NULL, so still shown)`);
  console.log("\nresolved countries:");
  for (const [c, n] of [...tally].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${c}  ${n}`);
  }
  const foreign = [...tally].filter(([c]) => c !== "US").reduce((a, b) => a + b[1], 0);
  console.log(`\n=> ${foreign} listings will drop out of the US-only feed.`);

  if (!APPLY) {
    console.log("\nreport only — re-run with --apply to write");
    return;
  }

  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const params: string[] = [];
    const tuples = chunk.map((u, k) => {
      params.push(u.id, u.country);
      return `($${k * 2 + 1},$${k * 2 + 2})`;
    });
    await prisma.$executeRawUnsafe(
      `UPDATE "Listing" SET country = v.c FROM (VALUES ${tuples.join(",")}) ` +
        `AS v(id, c) WHERE "Listing".id = v.id`,
      ...params,
    );
  }
  console.log(`\nset country on ${updates.length} rows`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
