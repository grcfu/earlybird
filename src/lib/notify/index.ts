import { prisma } from "@/lib/prisma";
import { Category } from "@/generated/prisma/client";
import { matchesPreference } from "@/lib/notify/matcher";
import { sendViaChannel, type ChannelKind } from "@/lib/notify/channels";
import type { NotifyListing } from "@/lib/notify/format";

// Cap how many roles a single send can contain, so the very first ingest (where
// everything has a fresh firstSeenAt) can't fire a 5,000-role email. Newest are
// kept; SentNotification dedup means the rest go out on subsequent runs.
const MAX_PER_SEND = 50;
// Upper bound on candidates pulled before in-memory keyword/location filtering.
const CANDIDATE_FETCH_LIMIT = 500;

export interface NotifyPrefResult {
  preferenceId: string;
  email: string;
  channel: ChannelKind;
  frequency: string;
  matched: number; // listings matched after filtering
  sent: number; // listings actually included in a send
  skipped?: string; // reason this preference didn't send
  error?: string; // channel send failure
}

export interface NotifySummary {
  preferences: number;
  totalSent: number;
  results: NotifyPrefResult[];
  durationMs: number;
}

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

// Decide whether a daily-digest preference is due right now.
function digestDue(
  digestHour: number,
  lastDigestAt: Date | null,
  now: Date,
): boolean {
  if (now.getUTCHours() !== digestHour) return false;
  if (lastDigestAt && sameUtcDay(lastDigestAt, now)) return false; // already today
  return true;
}

// Run notifications for all enabled preferences. Never throws — per-preference
// failures are captured in the summary. `force` ignores digest scheduling
// (useful for manual testing / "send my digest now").
export async function runNotifications(opts?: {
  now?: Date;
  force?: boolean;
}): Promise<NotifySummary> {
  const start = Date.now();
  const now = opts?.now ?? new Date();
  const force = opts?.force ?? false;

  const prefs = await prisma.notificationPreference.findMany({
    where: { enabled: true },
    include: { user: true },
  });

  const results: NotifyPrefResult[] = [];

  for (const pref of prefs) {
    const r: NotifyPrefResult = {
      preferenceId: pref.id,
      email: pref.user.email,
      channel: pref.channel as ChannelKind,
      frequency: pref.frequency,
      matched: 0,
      sent: 0,
    };

    // Daily digests only fire in their configured hour, once per day.
    if (pref.frequency === "DAILY_DIGEST" && !force) {
      if (!digestDue(pref.digestHour, pref.lastDigestAt, now)) {
        r.skipped = "digest not due";
        results.push(r);
        continue;
      }
    }

    const cutoff = new Date(now.getTime() - pref.recencyWindowHours * 3_600_000);

    // Candidates: fresh (by firstSeenAt), category/active pre-filtered in SQL,
    // and not already alerted to this user.
    const candidates = await prisma.listing.findMany({
      where: {
        firstSeenAt: { gte: cutoff },
        ...(pref.activeOnly ? { active: true } : {}),
        ...(pref.categories.length
          ? { category: { in: pref.categories as Category[] } }
          : {}),
        sentNotifications: { none: { userId: pref.userId } },
      },
      orderBy: { effectiveAt: "desc" },
      take: CANDIDATE_FETCH_LIMIT,
      select: {
        id: true,
        company: true,
        title: true,
        category: true,
        locations: true,
        applyUrl: true,
        active: true,
      },
    });

    // Apply keyword + location filters (substring) in memory.
    const matched = candidates.filter((l) =>
      matchesPreference(
        { category: l.category, title: l.title, locations: l.locations, active: l.active },
        {
          categories: pref.categories,
          keywords: pref.keywords,
          locationsFilter: pref.locationsFilter,
          activeOnly: pref.activeOnly,
        },
      ),
    );
    r.matched = matched.length;

    if (matched.length === 0) {
      r.skipped = "no new matches";
      results.push(r);
      continue;
    }

    const toSend = matched.slice(0, MAX_PER_SEND);
    const payload: NotifyListing[] = toSend.map((l) => ({
      company: l.company,
      title: l.title,
      category: l.category,
      locations: l.locations,
      applyUrl: l.applyUrl,
    }));

    try {
      await sendViaChannel(r.channel, pref.channelTarget, payload);

      // Record what we sent so it's never re-alerted (unique on userId+listingId).
      await prisma.sentNotification.createMany({
        data: toSend.map((l) => ({ userId: pref.userId, listingId: l.id })),
        skipDuplicates: true,
      });

      if (pref.frequency === "DAILY_DIGEST") {
        await prisma.notificationPreference.update({
          where: { id: pref.id },
          data: { lastDigestAt: now },
        });
      }
      r.sent = toSend.length;
    } catch (err) {
      // Leave SentNotification untouched so the next run retries these listings.
      r.error = err instanceof Error ? err.message : String(err);
      console.error(`[notify] preference ${pref.id} failed: ${r.error}`);
    }

    results.push(r);
  }

  const summary: NotifySummary = {
    preferences: prefs.length,
    totalSent: results.reduce((a, r) => a + r.sent, 0),
    results,
    durationMs: Date.now() - start,
  };
  console.log(
    `[notify] ${summary.preferences} prefs · sent ${summary.totalSent} alerts in ${summary.durationMs}ms`,
  );
  return summary;
}
