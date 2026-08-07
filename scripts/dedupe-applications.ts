// Merge tracked applications that the current rules consider the same one.
//
// De-duplication normally happens as signals arrive, so rows that only became
// duplicates after the matching rules improved — "Capitalone" now matching
// "Capital One" — stay split until another email or feed mark touches that
// company. This sweeps existing rows through the same merge path once.
//
//   npx tsx scripts/dedupe-applications.ts             # report only, all owners
//   npx tsx scripts/dedupe-applications.ts --apply     # write
//   npx tsx scripts/dedupe-applications.ts --key=eb_…  # one tracker key
//
// Idempotent: a second run finds nothing left to merge.

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { remergeApplications } from "@/lib/apptracker/store";

const APPLY = process.argv.includes("--apply");
const ONLY_KEY = process.argv
  .find((a) => a.startsWith("--key="))
  ?.slice("--key=".length);

async function main() {
  const owners = ONLY_KEY
    ? [ONLY_KEY]
    : (
        await prisma.trackedApplication.findMany({
          distinct: ["ownerKey"],
          select: { ownerKey: true },
        })
      ).map((r) => r.ownerKey);

  let absorbed = 0;
  for (const ownerKey of owners) {
    const res = await remergeApplications(ownerKey, APPLY);
    absorbed += res.absorbed;
    for (const group of res.groups) {
      console.log(`  ${ownerKey.slice(0, 8)}…  ${group.join("  +  ")}`);
    }
  }

  console.log(
    `\n${owners.length} tracker(s): ${absorbed} duplicate row(s) to absorb.` +
      (APPLY ? " Applied." : " Dry run — pass --apply to write."),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
