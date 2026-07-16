import { prisma } from "@/lib/prisma";
import type { AppStage } from "@/generated/prisma/client";
import type { Classification } from "@/lib/apptracker/classify";
import { STAGE_RANK, toStageKey, type AppStageKey } from "@/lib/apptracker/stages";

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

// Upsert an application from a classified email. Stage only ever advances (a
// late acknowledgment won't overwrite an interview); appliedAt keeps the
// earliest date ever seen. Skips emails we couldn't confidently classify.
export async function recordApplication(
  ownerKey: string,
  c: Classification,
  subject: string,
): Promise<RecordResult> {
  const stageKey = toStageKey(c.stage);
  if (!c.company) return { status: "skipped", reason: "no company detected" };
  if (!stageKey) return { status: "skipped", reason: "no stage detected" };

  const company = c.company;
  const role = c.role ?? "";
  const eventDate = new Date(c.eventDate);

  const existing = await prisma.trackedApplication.findUnique({
    where: { ownerKey_company_role: { ownerKey, company, role } },
  });

  if (!existing) {
    await prisma.trackedApplication.create({
      data: {
        ownerKey,
        company,
        role,
        stage: stageKey as AppStage,
        eventDate,
        appliedAt: eventDate,
        source: "email",
        lastSubject: subject || null,
      },
    });
    return { status: "created", company, stage: stageKey };
  }

  const advance =
    STAGE_RANK[stageKey] >= STAGE_RANK[existing.stage as AppStageKey];
  const appliedAt =
    existing.appliedAt && existing.appliedAt <= eventDate
      ? existing.appliedAt
      : eventDate;

  await prisma.trackedApplication.update({
    where: { id: existing.id },
    data: {
      stage: advance ? (stageKey as AppStage) : existing.stage,
      eventDate: advance ? eventDate : existing.eventDate,
      appliedAt,
      lastSubject: subject || existing.lastSubject,
    },
  });
  return {
    status: "updated",
    company,
    stage: advance ? stageKey : (existing.stage as AppStageKey),
  };
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
