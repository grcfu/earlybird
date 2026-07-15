import type { NormalizedHackathon } from "@/lib/ingest/hackathons/types";

// Merge hackathons sharing an id (same event across MLH + Devpost) into one row.
function mergeGroup(
  group: NormalizedHackathon[],
  priority: string[],
): NormalizedHackathon {
  const rank = (s: string) => {
    const i = priority.indexOf(s);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sorted = [...group].sort((a, b) => rank(a.source) - rank(b.source));
  const primary = sorted[0];

  const firstDefined = <T>(pick: (h: NormalizedHackathon) => T | null): T | null =>
    sorted.map(pick).find((v) => v != null) ?? null;

  // Earliest known start (truest "when it runs").
  const startsAt =
    sorted
      .map((h) => h.startsAt)
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const themes = Array.from(new Set(sorted.flatMap((h) => h.themes)));
  const participants =
    sorted
      .map((h) => h.participants)
      .filter((n): n is number => typeof n === "number")
      .sort((a, b) => b - a)[0] ?? null; // keep the largest reported count

  return {
    id: primary.id,
    source: Array.from(new Set(sorted.map((h) => h.source))).join("+"),
    name: primary.name,
    url: primary.url,
    format: primary.format,
    locationLabel: primary.locationLabel || (firstDefined((h) => h.locationLabel) ?? ""),
    country: firstDefined((h) => h.country),
    startsAt,
    endsAt: firstDefined((h) => h.endsAt),
    dateLabel: firstDefined((h) => h.dateLabel),
    prize: firstDefined((h) => h.prize),
    themes,
    participants,
    imageUrl: firstDefined((h) => h.imageUrl),
    active: sorted.some((h) => h.active),
  };
}

// Collapse hackathons across sources by id. Returns the merged set + how many
// rows were absorbed by dedup.
export function mergeHackathons(
  hackathons: NormalizedHackathon[],
  priority: string[],
): { merged: NormalizedHackathon[]; collapsed: number } {
  const byId = new Map<string, NormalizedHackathon[]>();
  for (const h of hackathons) {
    const group = byId.get(h.id);
    if (group) group.push(h);
    else byId.set(h.id, [h]);
  }

  const merged: NormalizedHackathon[] = [];
  let collapsed = 0;
  for (const group of byId.values()) {
    if (group.length === 1) merged.push(group[0]);
    else {
      collapsed += group.length - 1;
      merged.push(mergeGroup(group, priority));
    }
  }
  return { merged, collapsed };
}
