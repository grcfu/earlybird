// Re-read the stored emails behind each tracked application and correct the
// company when the classifier now reads it differently.
//
// Classification happens once, on arrival, so an application keeps whatever the
// rules said that day — "Nav" for an email whose only mention of Roblox was a
// parenthetical in the From name. Every classified email is kept in full, so a
// fixed classifier can simply be re-run over them. Applications tracked from the
// feed, or from before bodies were stored, have nothing to re-read and are left
// alone.
//
//   npx tsx scripts/reclassify-applications.ts                    # report only
//   npx tsx scripts/reclassify-applications.ts --company=Nav      # one row
//   npx tsx scripts/reclassify-applications.ts --company=Nav --apply
//
// Read the dry run before applying, and prefer --company. The classifier has
// drifted in both directions since these rows were written, so a blanket sweep
// rewrites more than the fix you just made — it will happily "correct" a row
// that was already right.
//
// Renames only — the merge that follows a rename (the corrected company may
// already have a row) is left to remergeApplications, which this calls at the
// end for each affected tracker. Idempotent.

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { classifyEmail } from "@/lib/apptracker/classify";
import { sameCompany } from "@/lib/apptracker/normalize";
import { recompanyApplication } from "@/lib/apptracker/store";

const APPLY = process.argv.includes("--apply");
const ONLY_COMPANY = process.argv
  .find((a) => a.startsWith("--company="))
  ?.slice("--company=".length);

async function main() {
  const apps = await prisma.trackedApplication.findMany({
    where: ONLY_COMPANY ? { company: ONLY_COMPANY } : {},
    include: { emails: { orderBy: { eventDate: "desc" } } },
  });

  let renamed = 0;

  for (const app of apps) {
    if (app.emails.length === 0) continue;
    // The newest email that still names a company: later mail in a thread is
    // the most likely to be the employer's own, rather than a forward.
    const reread = app.emails
      .map((e) =>
        classifyEmail({
          subject: e.subject,
          body: e.body,
          from: e.fromAddr ?? undefined,
          localDate: e.eventDate.toISOString().slice(0, 10),
        }),
      )
      .find((c) => c.company)?.company;

    if (!reread || sameCompany(reread, app.company)) continue;

    renamed++;
    const how = APPLY
      ? await recompanyApplication(app.ownerKey, app.id, reread)
      : "";
    console.log(
      `  ${app.ownerKey.slice(0, 8)}…  ${app.company}  ->  ${reread}` +
        (how ? `  (${how})` : ""),
    );
  }

  console.log(
    `\n${apps.length} application(s): ${renamed} to rename.` +
      (APPLY ? " Applied." : " Dry run — pass --apply to write."),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
