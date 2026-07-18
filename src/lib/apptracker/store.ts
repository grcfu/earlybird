import { prisma } from "@/lib/prisma";
import type { AppStage } from "@/generated/prisma/client";
import type { Classification } from "@/lib/apptracker/classify";
import { STAGE_RANK, toStageKey, type AppStageKey } from "@/lib/apptracker/stages";
import { normalizeCompany } from "@/lib/apptracker/normalize";

// Serializable row for the client (dates as ISO strings).
export interface ApplicationRow {
  id: string;
  company: string;
  role: string;
  stage: AppStageKey;
  eventDate: string;
  appliedAt: string | null;
  source: string;
  lastSubject: string | null;
  updatedAt: string;
}

export type RecordResult =
  | { status: "created" | "updated"; company: string; stage: AppStageKey }
  | { status: "skipped"; reason: string };

// Upsert an application from a classified email, de-duplicating by NORMALIZED
// company (not exact string), so differently-worded emails about the same
// application land on one row. If earlier bugs/races left several rows for one
// company, they're merged here too — so this self-heals existing duplicates.
//
// Merge rules: stage only ever advances (a late acknowledgment won't overwrite
// an interview); appliedAt keeps the earliest date ever seen; role keeps the
// most specific (longest) non-empty value; the company display keeps the
// cleanest (shortest) string. Skips emails we couldn't confidently classify.
export async function recordApplication(
  ownerKey: string,
  c: Classification,
  subject: string,
): Promise<RecordResult> {
  const stageKey = toStageKey(c.stage);
  if (!c.company) return { status: "skipped", reason: "no company detected" };
  if (!stageKey) return { status: "skipped", reason: "no stage detected" };

  const companyKey = normalizeCompany(c.company);
  if (!companyKey) return { status: "skipped", reason: "no company detected" };
  const role = c.role ?? "";
  const eventDate = new Date(c.eventDate);

  // A user has few applications, so scan their rows and match by normalized key.
  const rows = await prisma.trackedApplication.findMany({ where: { ownerKey } });
  const matches = rows.filter((r) => normalizeCompany(r.company) === companyKey);

  if (matches.length === 0) {
    await prisma.trackedApplication.create({
      data: {
        ownerKey,
        company: c.company,
        role,
        stage: stageKey as AppStage,
        eventDate,
        appliedAt: eventDate,
        source: "email",
        lastSubject: subject || null,
      },
    });
    return { status: "created", company: c.company, stage: stageKey };
  }

  // Fold every matching row + the incoming email into one set of values.
  const stages = [...matches.map((r) => r.stage as AppStageKey), stageKey];
  const topRank = Math.max(...stages.map((s) => STAGE_RANK[s]));
  const advance = STAGE_RANK[stageKey] >= topRank;
  // Stage/date come from whichever source holds the most-advanced stage.
  const stageHolder =
    advance ? null : matches.find((r) => STAGE_RANK[r.stage as AppStageKey] === topRank);
  const finalStage: AppStageKey = advance
    ? stageKey
    : (stageHolder!.stage as AppStageKey);
  const finalEventDate = advance ? eventDate : stageHolder!.eventDate;

  const applieds = [
    ...matches.map((r) => r.appliedAt).filter((d): d is Date => d != null),
    eventDate,
  ];
  const appliedAt = applieds.reduce((a, b) => (b < a ? b : a), applieds[0]);

  const finalRole =
    [...matches.map((r) => r.role), role]
      .filter((x) => x.length > 0)
      .sort((a, b) => b.length - a.length)[0] ?? "";
  const finalCompany =
    [...matches.map((r) => r.company), c.company].sort(
      (a, b) => a.length - b.length,
    )[0] ?? c.company;

  // Keep the first match as the survivor; delete the rest before updating it so
  // the (company, role) unique index can't be tripped mid-merge.
  const survivor = matches[0];
  const extras = matches.slice(1).map((r) => r.id);
  const ops = [];
  if (extras.length) {
    ops.push(prisma.trackedApplication.deleteMany({ where: { id: { in: extras } } }));
  }
  ops.push(
    prisma.trackedApplication.update({
      where: { id: survivor.id },
      data: {
        company: finalCompany,
        role: finalRole,
        stage: finalStage as AppStage,
        eventDate: finalEventDate,
        appliedAt,
        lastSubject: subject || survivor.lastSubject,
      },
    }),
  );
  await prisma.$transaction(ops);

  return { status: "updated", company: finalCompany, stage: finalStage };
}

export async function listApplications(
  ownerKey: string,
): Promise<ApplicationRow[]> {
  const rows = await prisma.trackedApplication.findMany({
    where: { ownerKey },
    orderBy: [{ eventDate: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    company: r.company,
    role: r.role,
    stage: r.stage as AppStageKey,
    eventDate: r.eventDate.toISOString(),
    appliedAt: r.appliedAt ? r.appliedAt.toISOString() : null,
    source: r.source,
    lastSubject: r.lastSubject,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// Delete one tracked application (only if it belongs to this owner key).
export async function deleteApplication(
  ownerKey: string,
  id: string,
): Promise<boolean> {
  const res = await prisma.trackedApplication.deleteMany({
    where: { id, ownerKey },
  });
  return res.count > 0;
}
