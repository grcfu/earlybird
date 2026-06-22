// CLI entrypoint: `npm run ingest`.
// Loads .env, runs ingestion across all configured sources, prints a summary.
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { ingestAll } from "@/lib/ingest";

async function main() {
  const start = Date.now();
  const results = await ingestAll();

  const totals = results.reduce(
    (acc, r) => {
      acc.created += r.created;
      acc.updated += r.updated;
      acc.failed += r.error ? 1 : 0;
      return acc;
    },
    { created: 0, updated: 0, failed: 0 },
  );

  console.log(
    `\n[ingest] done in ${Date.now() - start}ms — ` +
      `${totals.created} new, ${totals.updated} updated, ${totals.failed} source(s) failed`,
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
