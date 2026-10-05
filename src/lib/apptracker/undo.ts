import { prisma } from "@/lib/prisma";
import type {
  ApplicationEmail,
  CompanyAlias,
  TrackedApplication,
} from "@/generated/prisma/client";

// Undo for hand edits on the Applications page.
//
// An edit can touch more than the row it was made on — a rename can merge two
// applications (re-pointing emails, deleting a row) and save an alias; a stage
// correction drops hand-added stages. Rather than write an inverse for each
// action, withUndo snapshots the owner's applications, timeline links and
// aliases around the action and returns the difference as a plan that puts the
// "before" back. The client holds the plan (it's small — no email bodies) and
// posts it back to undo; nothing is stored server-side.

type Json<T> = { [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K] };
type AppJson = Json<TrackedApplication>;
type EmailJson = Json<ApplicationEmail>;
type AliasJson = Json<CompanyAlias>;

export interface UndoPlan {
  restoreApps: AppJson[]; // rows as they were, for rows changed or deleted
  deleteApps: string[]; // rows the action created
  repoint: { id: string; applicationId: string }[]; // emails moved by a merge
  recreateEmails: EmailJson[]; // hand-added stages the action removed
  deleteEmails: string[]; // timeline entries the action added
  restoreAliases: AliasJson[];
  deleteAliases: string[];
  // Each touched row's updatedAt right after the action. If one has moved since
  // (an email landed on it), undoing would roll that back too, so it's refused.
  expect: { id: string; updatedAt: string }[];
}

async function snapshot(ownerKey: string) {
  const [apps, links, manual, aliases] = await Promise.all([
    prisma.trackedApplication.findMany({ where: { ownerKey } }),
    prisma.applicationEmail.findMany({
      where: { ownerKey },
      select: { id: true, applicationId: true },
    }),
    prisma.applicationEmail.findMany({ where: { ownerKey, manual: true } }),
    prisma.companyAlias.findMany({ where: { ownerKey } }),
  ]);
  return { apps, links, manual, aliases };
}

const toJson = <T,>(row: T) => JSON.parse(JSON.stringify(row)) as Json<T>;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// updatedAt always moves on a write; it isn't part of what the user changed.
const appState = (r: TrackedApplication) => ({ ...r, updatedAt: null });

// Run a mutating action and return its result plus the plan that reverses it.
export async function withUndo<T>(
  ownerKey: string,
  action: () => Promise<T>,
): Promise<{ result: T; undo: UndoPlan }> {
  const before = await snapshot(ownerKey);
  const result = await action();
  const after = await snapshot(ownerKey);

  const afterApps = new Map(after.apps.map((r) => [r.id, r]));
  const beforeAppIds = new Set(before.apps.map((r) => r.id));
  const afterLinks = new Map(after.links.map((l) => [l.id, l.applicationId]));
  const beforeLinkIds = new Set(before.links.map((l) => l.id));
  const afterAliases = new Map(after.aliases.map((a) => [a.id, a]));
  const beforeAliasIds = new Set(before.aliases.map((a) => a.id));

  return {
    result,
    undo: {
      restoreApps: before.apps
        .filter((r) => {
          const now = afterApps.get(r.id);
          return !now || !same(appState(now), appState(r));
        })
        .map(toJson),
      deleteApps: after.apps.filter((r) => !beforeAppIds.has(r.id)).map((r) => r.id),
      repoint: before.links.filter(
        (l) => afterLinks.has(l.id) && afterLinks.get(l.id) !== l.applicationId,
      ),
      recreateEmails: before.manual.filter((e) => !afterLinks.has(e.id)).map(toJson),
      deleteEmails: after.links.filter((l) => !beforeLinkIds.has(l.id)).map((l) => l.id),
      restoreAliases: before.aliases
        .filter((a) => !same(afterAliases.get(a.id), a))
        .map(toJson),
      deleteAliases: after.aliases.filter((a) => !beforeAliasIds.has(a.id)).map((a) => a.id),
      expect: after.apps
        .filter((r) => {
          const was = before.apps.find((b) => b.id === r.id);
          return !was || !same(appState(was), appState(r));
        })
        .map((r) => ({ id: r.id, updatedAt: r.updatedAt.toISOString() })),
    },
  };
}

const date = (v: string | null) => (v == null ? null : new Date(v));

// Put things back the way a plan says. Everything is scoped to ownerKey — the
// plan comes back from the client, so it can only ever touch the caller's own
// rows. All-or-nothing: if something since then makes it impossible (say a
// restored name now collides), nothing changes and this returns false.
export async function applyUndo(ownerKey: string, plan: UndoPlan): Promise<boolean> {
  const owned = await prisma.trackedApplication.findMany({
    where: { id: { in: plan.restoreApps.map((r) => r.id) } },
    select: { id: true, ownerKey: true },
  });
  if (owned.some((r) => r.ownerKey !== ownerKey)) return false;

  const expect = plan.expect ?? [];
  const now = await prisma.trackedApplication.findMany({
    where: { ownerKey, id: { in: expect.map((e) => e.id) } },
    select: { id: true, updatedAt: true },
  });
  const changedSince = expect.some((e) => {
    const row = now.find((r) => r.id === e.id);
    return row != null && row.updatedAt.toISOString() !== e.updatedAt;
  });
  if (changedSince) return false;

  const ops = [
    prisma.companyAlias.deleteMany({ where: { ownerKey, id: { in: plan.deleteAliases } } }),
    prisma.applicationEmail.deleteMany({ where: { ownerKey, id: { in: plan.deleteEmails } } }),
    prisma.trackedApplication.deleteMany({ where: { ownerKey, id: { in: plan.deleteApps } } }),
    ...plan.restoreApps.map((r) => {
      const data = {
        company: r.company,
        role: r.role,
        stage: r.stage,
        eventDate: new Date(r.eventDate),
        appliedAt: date(r.appliedAt),
        source: r.source,
        lastSubject: r.lastSubject,
        referral: r.referral,
        cycle: r.cycle,
        deletedAt: date(r.deletedAt),
        companyLocked: r.companyLocked,
        roleLocked: r.roleLocked,
        stageSetAt: date(r.stageSetAt),
      };
      return prisma.trackedApplication.upsert({
        where: { id: r.id },
        create: { id: r.id, ownerKey, createdAt: new Date(r.createdAt), ...data },
        update: data,
      });
    }),
    ...plan.repoint.map((l) =>
      prisma.applicationEmail.updateMany({
        where: { ownerKey, id: l.id },
        data: { applicationId: l.applicationId },
      }),
    ),
    ...(plan.recreateEmails.length
      ? [
          prisma.applicationEmail.createMany({
            data: plan.recreateEmails.map((e) => ({
              ...e,
              ownerKey,
              eventDate: new Date(e.eventDate),
              createdAt: new Date(e.createdAt),
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
    ...plan.restoreAliases.map((a) =>
      prisma.companyAlias.upsert({
        where: { id: a.id },
        create: { id: a.id, ownerKey, alias: a.alias, company: a.company },
        update: { alias: a.alias, company: a.company },
      }),
    ),
  ];
  try {
    await prisma.$transaction(ops);
    return true;
  } catch {
    return false;
  }
}
