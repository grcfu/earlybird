// CLI entrypoint: `npm run notify` (add `-- --force` to bypass digest scheduling).
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { runNotifications } from "@/lib/notify";

async function main() {
  const force = process.argv.includes("--force");
  const summary = await runNotifications({ force });
  for (const r of summary.results) {
    console.log(
      `[notify] ${r.email} (${r.channel}/${r.frequency}): ` +
        (r.error
          ? `ERROR ${r.error}`
          : r.skipped
            ? `skipped — ${r.skipped}`
            : `matched ${r.matched}, sent ${r.sent}`),
    );
  }
  console.log(`\n[notify] done — ${summary.totalSent} alert(s) sent`);
}

main()
  .catch((err) => {
    console.error("[notify] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
