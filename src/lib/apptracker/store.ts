import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AppStage } from "@/generated/prisma/client";
import type { Classification } from "@/lib/apptracker/classify";
import {
  STAGE_RANK,
  toStageKey,
  stageFromTimeline,
  type AppStageKey,
  type StageEvent,
} from "@/lib/apptracker/stages";
import {
  normalizeCompany,
  companyKey,
  sameCompany,
  looksLikeAcronym,
} from "@/lib/apptracker/normalize";
import { applicationCycle, sameCycle } from "@/lib/apptracker/cycle";

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
  deletedAt: string | null; // set when in Trash
  cycle: number; // summer year this application targets; 0 = unknown
  referral: boolean; // set by hand — no email says it
  companyLocked: boolean; // company was typed by the user; ingest keeps it
  roleLocked: boolean; // role was typed by the user; ingest keeps it
  stageSetAt: string | null; // when the user last set the stage by hand
  timeline: StageEvent[]; // every stage seen (emails + hand-added), oldest first
}

// One stored email in an application's history.
export interface ApplicationEmailRow {
  id: string;
  subject: string;
  body: string;
  fromAddr: string | null;
  stage: AppStageKey;
  eventDate: string;
  manual: boolean; // a stage the user added by hand, not an email
  note: string | null;
}

// The raw email fields we persist (beyond what the classifier extracts).
export interface RawEmailInput {
  subject: string;
  body: string;
  from?: string;
  receivedAt?: string | Date;
}

export type RecordResult =
  | { status: "created" | "updated"; company: string; stage: AppStageKey }
  | { status: "skipped"; reason: string };

// Calendar day of a stored DateTime, for the date-string APIs in cycle.ts.
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Do a stored row and an incoming signal belong to the same application?
// Same employer AND same recruiting cycle. Without the cycle test, reapplying to
// a company next season folds into last season's row — inheriting its stage
// (which never moves backwards) and vanishing from the current cycle's view.
function isSameApplication(
  row: { company: string; role: string; appliedAt: Date | null; eventDate: Date },
  input: { company: string; role: string; eventDate: Date },
): boolean {
  return (
    sameCompany(row.company, input.company) &&
    sameCycle(
      {
        role: row.role,
        appliedAt: row.appliedAt ? isoDay(row.appliedAt) : null,
        eventDate: isoDay(row.eventDate),
      },
      { role: input.role, eventDate: isoDay(input.eventDate) },
    )
  );
}

function msgHashOf(subject: string, body: string, eventDate: string): string {
  return createHash("sha256")
    .update(`${subject}\0${body}\0${eventDate}`)
    .digest("hex")
    .slice(0, 32);
}

// Upsert one application by NORMALIZED company: create it, or fold the incoming
// signal into the existing row(s) — stage only advances, earliest appliedAt
// wins, most-specific role + cleanest company name kept, and any duplicate rows
// merge (with their emails re-pointed). A soft-deleted match stays in Trash
// unless another match is active. Shared by email ingest and feed sync.
async function upsertByCompany(
  ownerKey: string,
  input: {
    company: string;
    role: string;
    stage: AppStageKey;
    eventDate: Date;
    subject: string | null;
    source: string;
  },
): Promise<{ applicationId: string; company: string; stage: AppStageKey; created: boolean }> {
  const incomingDay = isoDay(input.eventDate);
  const rows = await prisma.trackedApplication.findMany({ where: { ownerKey } });
  const matches = rows.filter((r) => isSameApplication(r, input));

  if (matches.length === 0) {
    const cycle =
      applicationCycle(input.role, incomingDay, incomingDay)?.year ?? 0;
    const created = await prisma.trackedApplication.create({
      data: {
        ownerKey,
        company: input.company,
        role: input.role,
        stage: input.stage as AppStage,
        eventDate: input.eventDate,
        appliedAt: input.eventDate,
        source: input.source,
        lastSubject: input.subject,
        cycle,
      },
    });
    return { applicationId: created.id, company: input.company, stage: input.stage, created: true };
  }

  // Pick the winning stage by rank, breaking ties on the event date rather than
  // on processing order. Offer and rejected share the top rank, so without the
  // date tiebreak a replay could land on either one depending purely on which
  // email happened to be posted last — the same mail would produce a different
  // outcome each sweep. Ties are resolved deterministically instead.
  const rankOf = (s: AppStageKey) => STAGE_RANK[s];
  const holder = matches.reduce((best, r) => {
    const a = rankOf(r.stage as AppStageKey);
    const b = rankOf(best.stage as AppStageKey);
    if (a !== b) return a > b ? r : best;
    return r.eventDate > best.eventDate ? r : best;
  });
  const holderRank = rankOf(holder.stage as AppStageKey);
  const inputRank = rankOf(input.stage);
  // A stage the user set by hand outranks any email dated on or before the edit
  // — otherwise a backfill replaying old mail would quietly undo the correction.
  // Mail that arrives after it still advances the stage as usual.
  const stageSetAt = matches.reduce<Date | null>(
    (a, r) => (r.stageSetAt && (!a || r.stageSetAt > a) ? r.stageSetAt : a),
    null,
  );
  const pinned = stageSetAt != null && input.eventDate <= stageSetAt;
  const advance =
    !pinned &&
    (inputRank > holderRank ||
      (inputRank === holderRank && input.eventDate > holder.eventDate));
  const finalStage: AppStageKey = advance
    ? input.stage
    : (holder.stage as AppStageKey);
  const finalEventDate = advance ? input.eventDate : holder.eventDate;

  const applieds = [
    ...matches.map((r) => r.appliedAt).filter((d): d is Date => d != null),
    input.eventDate,
  ];
  const appliedAt = applieds.reduce((a, b) => (b < a ? b : a), applieds[0]);

  // A name or role the user typed is kept verbatim; the heuristics below only
  // choose among machine-read values.
  const lockedCompany = matches.find((r) => r.companyLocked)?.company;
  const lockedRole = matches.find((r) => r.roleLocked)?.role;
  const finalRole =
    lockedRole ??
    [...matches.map((r) => r.role), input.role]
      .filter((x) => x.length > 0)
      .sort((a, b) => b.length - a.length)[0] ?? "";
  // Keep the cleanest (shortest) name, but never let a bare acronym win over the
  // spelled-out company it merged with — "CTC" is a worse label than "Chicago
  // Trading Company", even though it's shorter.
  const names = [...matches.map((r) => r.company), input.company];
  const spelledOut = names.filter((n) => !looksLikeAcronym(n));
  const shortest =
    (spelledOut.length ? spelledOut : names).sort(
      (a, b) => a.length - b.length,
    )[0] ?? input.company;
  // Among names that differ only in where the word breaks fall, prefer the
  // segmented one: shortest would otherwise pick the run-together form an ATS or
  // a sending domain produced ("Capitalone" over "Capital One"). Word count is
  // measured post-normalization, so peeled boilerplate ("Akuna Capital
  // Recruitment") doesn't count as extra words and win on this rule.
  const wordsIn = (n: string) => normalizeCompany(n).split(" ").filter(Boolean).length;
  const finalCompany =
    lockedCompany ??
    names
      .filter((n) => companyKey(n) === companyKey(shortest))
      .sort((a, b) => wordsIn(b) - wordsIn(a) || a.length - b.length)[0] ??
    shortest;
  const anyActive = matches.some((r) => r.deletedAt == null);
  // A referral is a hand-set fact about the application, not about the row it
  // happens to live on, so it survives a merge from whichever row carried it.
  const referral = matches.some((r) => r.referral);
  // Recompute from the merged role + earliest date: a merge can supply the year
  // an earlier email left unstated, which sharpens an estimated cycle.
  const finalCycle =
    applicationCycle(finalRole, isoDay(appliedAt), isoDay(finalEventDate))?.year ??
    matches.find((r) => r.cycle > 0)?.cycle ??
    0;

  const survivor = matches[0];
  const extras = matches.slice(1).map((r) => r.id);
  const ops = [];
  if (extras.length) {
    ops.push(
      prisma.applicationEmail.updateMany({
        where: { applicationId: { in: extras } },
        data: { applicationId: survivor.id },
      }),
    );
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
        lastSubject: input.subject || survivor.lastSubject,
        deletedAt: anyActive ? null : survivor.deletedAt,
        cycle: finalCycle,
        referral,
        companyLocked: lockedCompany != null,
        roleLocked: lockedRole != null,
        stageSetAt,
      },
    }),
  );
  await prisma.$transaction(ops);
  return { applicationId: survivor.id, company: finalCompany, stage: finalStage, created: false };
}

// Record an application from the internships feed (user marked a listing
// applied/interview/offer/rejected). No email body — source "feed". Deduped by
// company, so a later email for the same company merges into it.
export async function recordFeedApplication(
  ownerKey: string,
  input: { company: string; role: string; stage: AppStageKey; eventDate?: Date },
): Promise<RecordResult> {
  if (!input.company.trim()) return { status: "skipped", reason: "no company" };
  const { company, stage, created } = await upsertByCompany(ownerKey, {
    company: input.company,
    role: input.role ?? "",
    stage: input.stage,
    eventDate: input.eventDate ?? new Date(),
    subject: null,
    source: "feed",
  });
  return { status: created ? "created" : "updated", company, stage };
}

// Upsert an application from a classified email, de-duplicating by NORMALIZED
// company (not exact string), so differently-worded emails about the same
// application land on one row. Also merges any pre-existing duplicate rows.
//
// Merge rules: stage only ever advances; appliedAt keeps the earliest date;
// role keeps the most specific (longest) value; company keeps the cleanest
// (shortest) string; a soft-deleted match stays deleted (no auto-resurrect —
// the user can restore it from Trash). Every classified email is also stored in
// full for the application's message history. Skips unclassifiable emails.
export async function recordApplication(
  ownerKey: string,
  c: Classification,
  email: RawEmailInput,
): Promise<RecordResult> {
  const stageKey = toStageKey(c.stage);
  if (!c.company) return { status: "skipped", reason: "no company detected" };
  if (!stageKey) return { status: "skipped", reason: "no stage detected" };

  if (!normalizeCompany(c.company)) {
    return { status: "skipped", reason: "no company detected" };
  }
  const role = c.role ?? "";
  const eventDate = new Date(c.eventDate);
  const subject = email.subject || "";

  const { applicationId, company, stage, created } = await upsertByCompany(ownerKey, {
    company: c.company,
    role,
    stage: stageKey,
    eventDate,
    subject: subject || null,
    source: "email",
  });

  // Store the full email for the application's history (dedupe re-ingests).
  const hash = msgHashOf(subject, email.body, c.eventDate);
  const dupe = await prisma.applicationEmail.findFirst({
    where: { ownerKey, msgHash: hash },
    select: { id: true },
  });
  if (!dupe) {
    await prisma.applicationEmail.create({
      data: {
        applicationId,
        ownerKey,
        subject,
        body: email.body || "",
        fromAddr: email.from ?? null,
        stage: stageKey as AppStage,
        eventDate,
        msgHash: hash,
      },
    });
  }

  return { status: created ? "created" : "updated", company, stage };
}

// Correct the employer on one application — what a re-read of its stored emails
// concluded, after the classifier that first read them was wrong.
//
// A plain rename only works when nothing already sits under the corrected name.
// When something does (the same employer's other mail landed on its own row),
// this is a merge, not a rename: the row's signal goes through the normal upsert
// so stage, dates and role fold by the usual rules, its emails follow, and the
// misnamed row goes away.
export async function recompanyApplication(
  ownerKey: string,
  id: string,
  company: string,
): Promise<"renamed" | "merged" | "missing"> {
  return (await moveToCompany(ownerKey, id, company)).how;
}

// recompanyApplication, also reporting which row the application ended up on —
// a merge folds it into another row, and a hand rename needs to pin that one.
async function moveToCompany(
  ownerKey: string,
  id: string,
  company: string,
): Promise<{ how: "renamed" | "merged" | "missing"; applicationId: string }> {
  const row = await prisma.trackedApplication.findFirst({ where: { id, ownerKey } });
  if (!row) return { how: "missing", applicationId: id };

  const others = await prisma.trackedApplication.findMany({
    where: { ownerKey, id: { not: id } },
  });
  const input = { company, role: row.role, eventDate: row.eventDate };
  if (!others.some((r) => isSameApplication(r, input))) {
    await prisma.trackedApplication.update({ where: { id }, data: { company } });
    return { how: "renamed", applicationId: id };
  }

  const { applicationId } = await upsertByCompany(ownerKey, {
    company,
    role: row.role,
    stage: row.stage as AppStageKey,
    eventDate: row.eventDate,
    subject: row.lastSubject,
    source: row.source,
  });
  await prisma.$transaction([
    prisma.applicationEmail.updateMany({
      where: { applicationId: id },
      data: { applicationId },
    }),
    prisma.trackedApplication.deleteMany({ where: { id, ownerKey } }),
  ]);
  return { how: "merged", applicationId };
}

// Re-apply the current merge rules to rows that are already stored.
//
// De-duplication happens when a signal arrives, so two rows that only became
// duplicates after the rules improved ("Capitalone" now matching "Capital One")
// stay split until another email or feed mark touches that company. This sweeps
// them together by replaying each duplicate group's own head through the normal
// upsert path — same merge rules, no second implementation. Idempotent; rows
// with no duplicate are left untouched.
export async function remergeApplications(
  ownerKey: string,
  apply = true,
): Promise<{ absorbed: number; groups: string[][] }> {
  const rows = await prisma.trackedApplication.findMany({ where: { ownerKey } });
  const seen = new Set<string>();
  const groups: string[][] = [];
  let absorbed = 0;

  for (const head of rows) {
    if (seen.has(head.id)) continue;
    const group = rows.filter((r) => !seen.has(r.id) && isSameApplication(r, head));
    for (const r of group) seen.add(r.id);
    if (group.length < 2) continue;

    groups.push(group.map((r) => r.company));
    absorbed += group.length - 1;
    if (!apply) continue;
    await upsertByCompany(ownerKey, {
      company: head.company,
      role: head.role,
      stage: head.stage as AppStageKey,
      eventDate: head.eventDate,
      subject: head.lastSubject,
      source: head.source,
    });
  }

  return { absorbed, groups };
}

// List a user's applications. Includes Trash (deletedAt set) so the UI can show
// a Trash section; the UI splits on deletedAt.
export async function listApplications(
  ownerKey: string,
): Promise<ApplicationRow[]> {
  const [rows, events] = await Promise.all([
    prisma.trackedApplication.findMany({
      where: { ownerKey },
      orderBy: [{ eventDate: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.applicationEmail.findMany({
      where: { ownerKey },
      select: { applicationId: true, stage: true, eventDate: true },
      orderBy: { eventDate: "asc" },
    }),
  ]);
  const timelines = new Map<string, StageEvent[]>();
  for (const e of events) {
    const list = timelines.get(e.applicationId) ?? [];
    list.push({ stage: e.stage as AppStageKey, date: e.eventDate.toISOString() });
    timelines.set(e.applicationId, list);
  }
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
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    cycle: r.cycle,
    referral: r.referral,
    companyLocked: r.companyLocked,
    roleLocked: r.roleLocked,
    stageSetAt: r.stageSetAt ? r.stageSetAt.toISOString() : null,
    timeline: timelines.get(r.id) ?? [],
  }));
}

// Mark (or unmark) an application as having come with a referral. Owner-scoped.
export async function setReferral(
  ownerKey: string,
  id: string,
  referral: boolean,
): Promise<boolean> {
  const res = await prisma.trackedApplication.updateMany({
    where: { id, ownerKey },
    data: { referral },
  });
  return res.count > 0;
}

// Hand-correct an application's company, role and/or stage. Each edit is pinned
// (see upsertByCompany) so later ingest doesn't revert it. Returns the id the
// application lives on afterwards — renaming into an employer that already has a
// row merges the two — or null when it isn't the caller's.
export async function updateApplication(
  ownerKey: string,
  id: string,
  edit: { company?: string; role?: string; stage?: AppStageKey },
): Promise<string | null> {
  const row = await prisma.trackedApplication.findFirst({ where: { id, ownerKey } });
  if (!row) return null;
  let appId = id;

  if (edit.company !== undefined && edit.company !== row.company) {
    appId = (await moveToCompany(ownerKey, id, edit.company)).applicationId;
    // Pin after the move: a merge picks among names, and the user's wins.
    await prisma.trackedApplication.update({
      where: { id: appId },
      data: { company: edit.company, companyLocked: true },
    });
  }

  if (edit.role !== undefined) {
    const cur = await prisma.trackedApplication.findUniqueOrThrow({ where: { id: appId } });
    // The role can name the year outright, so it may move the cycle.
    const cycle =
      applicationCycle(
        edit.role,
        cur.appliedAt ? isoDay(cur.appliedAt) : null,
        isoDay(cur.eventDate),
      )?.year ?? cur.cycle;
    await prisma.trackedApplication.update({
      where: { id: appId },
      data: { role: edit.role, roleLocked: true, cycle },
    });
  }

  if (edit.stage !== undefined) {
    const cur = await prisma.trackedApplication.findUniqueOrThrow({ where: { id: appId } });
    if (edit.stage !== cur.stage) {
      // A correction, so unlike ingest it may move backwards. It's also logged
      // on the timeline, dated today, so the export has a date for the stage.
      const now = new Date();
      await prisma.$transaction([
        prisma.trackedApplication.update({
          where: { id: appId },
          data: { stage: edit.stage as AppStage, eventDate: now, stageSetAt: now },
        }),
        manualEvent(ownerKey, appId, edit.stage, now, null),
      ]);
    }
  }

  return appId;
}

// A hand-added timeline entry. msgHash is unique per entry so it never collides
// with (or dedupes against) a real email.
function manualEvent(
  ownerKey: string,
  applicationId: string,
  stage: AppStageKey,
  date: Date,
  note: string | null,
) {
  return prisma.applicationEmail.create({
    data: {
      applicationId,
      ownerKey,
      subject: "",
      body: "",
      stage: stage as AppStage,
      eventDate: date,
      msgHash: `manual:${createHash("sha256").update(`${applicationId}\0${Date.now()}\0${Math.random()}`).digest("hex").slice(0, 24)}`,
      manual: true,
      note,
    },
  });
}

// Add a stage the tracker missed — the OA email that never got labeled, say —
// with the date it happened. The stage advances if this is now the furthest one
// (same rank rule as ingest); an earlier APPLIED moves appliedAt back.
export async function addStageEvent(
  ownerKey: string,
  id: string,
  ev: { stage: AppStageKey; date: Date; note?: string | null },
): Promise<boolean> {
  const row = await prisma.trackedApplication.findFirst({ where: { id, ownerKey } });
  if (!row) return false;
  const best = stageFromTimeline([
    { stage: row.stage as AppStageKey, date: row.eventDate.toISOString() },
    { stage: ev.stage, date: ev.date.toISOString() },
  ])!;
  const appliedAt =
    ev.stage === "APPLIED" && (!row.appliedAt || ev.date < row.appliedAt)
      ? ev.date
      : row.appliedAt;
  await prisma.$transaction([
    manualEvent(ownerKey, id, ev.stage, ev.date, ev.note?.trim() || null),
    prisma.trackedApplication.update({
      where: { id },
      data: {
        stage: best.stage as AppStage,
        eventDate: new Date(best.date),
        appliedAt,
        stageSetAt: new Date(),
      },
    }),
  ]);
  return true;
}

// Remove a hand-added stage (emails can't be removed this way). When it was the
// stage the application is at, the stage falls back to what the rest of the
// timeline adds up to.
export async function deleteStageEvent(
  ownerKey: string,
  eventId: string,
): Promise<boolean> {
  const ev = await prisma.applicationEmail.findFirst({
    where: { id: eventId, ownerKey, manual: true },
  });
  if (!ev) return false;
  await prisma.applicationEmail.delete({ where: { id: eventId } });

  const row = await prisma.trackedApplication.findUnique({ where: { id: ev.applicationId } });
  if (!row || row.stage !== ev.stage) return true;
  const rest = await prisma.applicationEmail.findMany({
    where: { applicationId: row.id },
    select: { stage: true, eventDate: true },
  });
  const best = stageFromTimeline(
    rest.map((e) => ({ stage: e.stage as AppStageKey, date: e.eventDate.toISOString() })),
  );
  // Nothing left on the timeline (a row that predates stored emails): keep the
  // stage as is rather than inventing one.
  if (best) {
    await prisma.trackedApplication.update({
      where: { id: row.id },
      data: { stage: best.stage as AppStage, eventDate: new Date(best.date) },
    });
  }
  return true;
}

// Add an application the tracker never caught. It goes through the same upsert
// as email and feed marks, so if the company is already tracked this cycle it
// merges into that row instead of duplicating it. What was typed is pinned.
export async function createManualApplication(
  ownerKey: string,
  input: { company: string; role: string; stage: AppStageKey; date: Date },
): Promise<string> {
  const { applicationId } = await upsertByCompany(ownerKey, {
    company: input.company,
    role: input.role,
    stage: input.stage,
    eventDate: input.date,
    subject: null,
    source: "manual",
  });
  await prisma.$transaction([
    prisma.trackedApplication.update({
      where: { id: applicationId },
      data: {
        company: input.company,
        companyLocked: true,
        ...(input.role ? { role: input.role, roleLocked: true } : {}),
        deletedAt: null,
      },
    }),
    manualEvent(ownerKey, applicationId, input.stage, input.date, null),
  ]);
  return applicationId;
}

// The full stored email history for one application (owner-scoped).
export async function listApplicationEmails(
  ownerKey: string,
  applicationId: string,
): Promise<ApplicationEmailRow[]> {
  const rows = await prisma.applicationEmail.findMany({
    where: { applicationId, ownerKey },
    orderBy: { eventDate: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    body: r.body,
    fromAddr: r.fromAddr,
    stage: r.stage as AppStageKey,
    eventDate: r.eventDate.toISOString(),
    manual: r.manual,
    note: r.note,
  }));
}

// Soft delete → moves to Trash (restorable). Owner-scoped.
export async function deleteApplication(
  ownerKey: string,
  id: string,
): Promise<boolean> {
  const res = await prisma.trackedApplication.updateMany({
    where: { id, ownerKey, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return res.count > 0;
}

// Restore from Trash → back to All. Owner-scoped.
export async function restoreApplication(
  ownerKey: string,
  id: string,
): Promise<boolean> {
  const res = await prisma.trackedApplication.updateMany({
    where: { id, ownerKey },
    data: { deletedAt: null },
  });
  return res.count > 0;
}
