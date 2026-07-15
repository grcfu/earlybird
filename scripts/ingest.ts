// CLI entrypoint: `npm run ingest`.
// Loads .env, runs ingestion across all configured sources, prints a summary.
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { ingestAll } from "@/lib/ingest";
import { ingestHackathons } from "@/lib/ingest/hackathons";

async function main() {
  const summary = await ingestAll();
  console.log(
    `\n[ingest] done in ${summary.durationMs}ms — ` +
      `${summary.created} new, ${summary.updated} updated, ` +
      `${summary.collapsed} collapsed, ${summary.failedSources} source(s) failed`,
  );

  const hack = await ingestHackathons();
  console.log(
    `[ingest:hackathons] done in ${hack.durationMs}ms — ` +
      `${hack.created} new, ${hack.updated} updated, ` +
      `${hack.collapsed} collapsed, ${hack.failedSources} source(s) failed`,
  );
}

main()
  .catch((err) => {
    console.error("[ingest] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
