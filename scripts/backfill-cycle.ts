// Populate TrackedApplication.cycle for rows created before the column existed.
//
// The 20260729190000_application_cycle migration adds the column with a default
// of 0; the value itself is derived here so applicationCycle() stays the single
// definition of where one recruiting season ends and the next begins.
//
//   npx tsx scripts/backfill-cycle.ts          # report only
//   npx tsx scripts/backfill-cycle.ts --apply  # write
//
// Idempotent: re-running recomputes the same values.

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { applicationCycle, cycleLabel } from "@/lib/apptracker/cycle";

const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await prisma.trackedApplication.findMany({
    orderBy: { appliedAt: "desc" },
  });

  let changed = 0;
  let unknown = 0;
  for (const r of rows) {
    const c = applicationCycle(
      r.role,
      r.appliedAt ? r.appliedAt.toISOString().slice(0, 10) : null,
      r.eventDate.toISOString().slice(0, 10),
    );
    const cycle = c?.year ?? 0;
    if (cycle === 0) unknown++;
    if (cycle === r.cycle) continue;
    changed++;
    console.log(
      `  ${r.company.padEnd(26)} ${String(r.cycle).padEnd(5)} -> ${cycle}` +
        `  ${cycle ? cycleLabel(cycle) : "unknown"}${c?.estimated ? " (inferred)" : " (stated)"}`,
    );
    if (APPLY) {
      await prisma.trackedApplication.update({
        where: { id: r.id },
        data: { cycle },
      });
    }
  }

  console.log(
    `\n${rows.length} application(s): ${changed} to update, ${unknown} with no determinable cycle.` +
      (APPLY ? " Applied." : " Dry run — pass --apply to write."),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
