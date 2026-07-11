"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ListingPage, ListingRow } from "@/lib/listings";
import { ListingCard } from "@/components/ListingCard";
import { isApplied, STATUS_LABEL, type TrackStatus } from "@/lib/track";

// Per-browser application tracking (anonymous feed → localStorage, not the DB).
const STATUS_KEY = "earlybird:status"; // { [listingId]: TrackStatus }
const NOTES_KEY = "earlybird:notes"; // { [listingId]: string }
// Snapshot of each tracked role's details (+ date applied), so the CSV can
// export everything you've tracked even if it's not currently loaded in the feed.
const META_KEY = "earlybird:meta";
const APPLIED_KEY = "earlybird:applied"; // legacy Set<id>, migrated to STATUS_KEY

interface TrackedMeta {
  company: string;
  title: string;
  applyUrl: string;
  locations: string[];
  datePosted: string | null;
  source: string;
  appliedAt?: string; // YYYY-MM-DD, set when status first becomes an applied state
}
// Timestamp (ms) of the previous visit, so we can flag roles first seen since.
const LASTVISIT_KEY = "earlybird:lastVisit";

// Empty-state copy per filter tab.
const EMPTY_COPY: Record<string, { title: string; hint: string }> = {
  all: { title: "No roles in this view.", hint: "Try widening the recency window or clearing filters." },
  unapplied: { title: "You've handled everything here!", hint: "Nothing left to apply to in this view." },
  applied: { title: "No applications tracked yet.", hint: "Set a role's status to Applied to track it here." },
  notinterested: { title: "Nothing dismissed.", hint: "Roles you mark Not interested show up here." },
};

export function Feed({
  initial,
  query,
  serverNow,
}: {
  initial: ListingPage;
  query: string;
  serverNow: number;
}) {
  const [listings, setListings] = useState<ListingRow[]>(initial.listings);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Single time reference shared by all rows; refreshed each minute on the client.
  const [now, setNow] = useState(serverNow);

  // Application status per role, kept in localStorage. Starts empty so server +
  // first client render match; hydrated in the effect below.
  const [statuses, setStatuses] = useState<Record<string, TrackStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, TrackedMeta>>({});
  // Client-side view filter over the loaded roles (status isn't known to the
  // server, so this can't live in the URL like the other filters).
  const [appliedFilter, setAppliedFilter] = useState<
    "all" | "unapplied" | "applied" | "notinterested"
  >("all");

  // Previous-visit timestamp: read the stored value (for "new since last visit"
  // highlighting), then stamp now() so the next visit compares against this one.
  const [lastVisit, setLastVisit] = useState<number | null>(null);

  useEffect(() => {
    // Hydrate tracking state from localStorage once, after mount. This must be
    // post-render (not a useState initializer) so server and first client render
    // match; the synchronous setState here is intentional.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const rawStatus = localStorage.getItem(STATUS_KEY);
      const statusMap: Record<string, TrackStatus> = rawStatus
        ? (JSON.parse(rawStatus) as Record<string, TrackStatus>)
        : {};
      if (!rawStatus) {
        // One-time migration: legacy applied Set -> {id: "applied"}.
        const legacy = localStorage.getItem(APPLIED_KEY);
        if (legacy) {
          for (const id of JSON.parse(legacy) as string[]) statusMap[id] = "applied";
          localStorage.setItem(STATUS_KEY, JSON.stringify(statusMap));
        }
      }
      setStatuses(statusMap);

      const rawNotes = localStorage.getItem(NOTES_KEY);
      if (rawNotes) setNotes(JSON.parse(rawNotes) as Record<string, string>);

      // Hydrate the tracked-role snapshot, backfilling details for any tracked
      // role that's on the first page but predates the snapshot store.
      const rawMeta = localStorage.getItem(META_KEY);
      const metaMap: Record<string, TrackedMeta> = rawMeta ? JSON.parse(rawMeta) : {};
      for (const l of initial.listings) {
        if (statusMap[l.id] && !metaMap[l.id]) {
          metaMap[l.id] = {
            company: l.company,
            title: l.title,
            applyUrl: l.applyUrl,
            locations: l.locations,
            datePosted: l.datePosted,
            source: l.source,
          };
        }
      }
      setMeta(metaMap);
      localStorage.setItem(META_KEY, JSON.stringify(metaMap));

      const lv = localStorage.getItem(LASTVISIT_KEY);
      setLastVisit(lv ? Number(lv) : null);
      localStorage.setItem(LASTVISIT_KEY, String(Date.now()));
    } catch {
      /* ignore malformed storage */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initial.listings]);

  // A role is "unseen" if it was first seen after your previous visit.
  const isUnseen = useCallback(
    (l: ListingRow) =>
      lastVisit != null && new Date(l.firstSeenAt).getTime() > lastVisit,
    [lastVisit],
  );

  const setStatus = useCallback(
    (listing: ListingRow, status: TrackStatus | "") => {
      const id = listing.id;
      setStatuses((prev) => {
        const next = { ...prev };
        if (status) next[id] = status;
        else delete next[id];
        try {
          localStorage.setItem(STATUS_KEY, JSON.stringify(next));
        } catch {
          /* ignore quota/availability errors */
        }
        return next;
      });
      // Keep a detail snapshot so the CSV can include this role later even if
      // it's scrolled away or filtered out, plus stamp the date first applied.
      setMeta((prev) => {
        const next = { ...prev };
        if (status) {
          const existing = next[id] ?? {
            company: listing.company,
            title: listing.title,
            applyUrl: listing.applyUrl,
            locations: listing.locations,
            datePosted: listing.datePosted,
            source: listing.source,
          };
          if (isApplied(status) && !existing.appliedAt) {
            existing.appliedAt = new Date().toISOString().slice(0, 10);
          }
          next[id] = existing;
        } else {
          delete next[id];
        }
        try {
          localStorage.setItem(META_KEY, JSON.stringify(next));
        } catch {
          /* ignore quota/availability errors */
        }
        return next;
      });
      // Notify the streak badge (same tab) once localStorage is written.
      setTimeout(() => window.dispatchEvent(new Event("earlybird:tracked")), 0);
    },
    [],
  );

  const setNote = useCallback((id: string, text: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (text) next[id] = text;
      else delete next[id];
      try {
        localStorage.setItem(NOTES_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota/availability errors */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Live refresh: poll the first page for this query and buffer roles we don't
  // already have, so a constant-checker sees brand-new postings without reloading.
  const [incoming, setIncoming] = useState<ListingRow[]>([]);
  const idsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    idsRef.current = new Set([
      ...listings.map((l) => l.id),
      ...incoming.map((l) => l.id),
    ]);
  }, [listings, incoming]);

  // Fetch the latest first page for the current query and return roles we don't
  // already have. Shared by the 60s auto-poll (buffers into the pill) and the
  // manual Refresh button (inserts immediately).
  const checkForNew = useCallback(async (): Promise<ListingRow[]> => {
    try {
      const res = await fetch(`/api/listings?${query}`);
      if (!res.ok) return [];
      const page: ListingPage = await res.json();
      return page.listings.filter((l) => !idsRef.current.has(l.id));
    } catch {
      return []; // transient network error — try again next tick
    }
  }, [query]);

  // Auto-poll every 60s → buffer new roles into the "show new" pill.
  useEffect(() => {
    const poll = async () => {
      const fresh = await checkForNew();
      if (fresh.length) setIncoming((prev) => [...fresh, ...prev]);
    };
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [checkForNew]);

  // Manual refresh → check now and insert new roles (plus any buffered) at top.
  const [refreshState, setRefreshState] = useState<"idle" | "checking" | "uptodate">(
    "idle",
  );
  const handleRefresh = useCallback(async () => {
    setRefreshState("checking");
    const fresh = await checkForNew();
    if (fresh.length || incoming.length) {
      setListings((prev) => [...fresh, ...incoming, ...prev]);
      setIncoming([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setRefreshState("idle");
    } else {
      setRefreshState("uptodate");
      setTimeout(() => setRefreshState("idle"), 2000);
    }
  }, [checkForNew, incoming]);

  // Reflect the pending count in the tab title so it's visible from another tab.
  useEffect(() => {
    document.title =
      incoming.length > 0
        ? `(${incoming.length}) new roles — EarlyBird`
        : "EarlyBird — fresh internships, first light";
  }, [incoming.length]);

  const showIncoming = useCallback(() => {
    setListings((prev) => [...incoming, ...prev]);
    setIncoming([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [incoming]);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/listings?${query}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page: ListingPage = await res.json();
      setListings((prev) => [...prev, ...page.listings]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, cursor, query]);

  // Infinite scroll: observe a sentinel near the bottom of the feed.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  if (listings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-20 text-center">
        <p className="font-display text-2xl font-bold text-ink">
          No roles in this window.
        </p>
        <p className="mt-2 font-mono text-xs text-ink-soft">
          Try widening the recency window or clearing filters.
        </p>
      </div>
    );
  }

  // Per-tab predicates. "Not interested" roles are dismissed — hidden from
  // every tab except their own.
  const notInterested = (id: string) => statuses[id] === "not_interested";
  const inTab = (l: ListingRow, tab: typeof appliedFilter): boolean => {
    switch (tab) {
      case "all":
        return !notInterested(l.id);
      case "unapplied":
        return !isApplied(statuses[l.id]) && !notInterested(l.id);
      case "applied":
        return isApplied(statuses[l.id]);
      case "notinterested":
        return notInterested(l.id);
    }
  };
  const countIn = (tab: typeof appliedFilter) =>
    listings.reduce((n, l) => (inTab(l, tab) ? n + 1 : n), 0);

  const FILTERS: { key: typeof appliedFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: countIn("all") },
    { key: "unapplied", label: "Unapplied", count: countIn("unapplied") },
    { key: "applied", label: "Applied", count: countIn("applied") },
    { key: "notinterested", label: "Not interested", count: countIn("notinterested") },
  ];

  const visible = listings.filter((l) => inTab(l, appliedFilter));

  const unseenCount = listings.reduce((n, l) => (isUnseen(l) ? n + 1 : n), 0);

  // Every role you've tracked (from the snapshot store), not just loaded ones.
  // Excludes "not interested" — that's a dismissal, not an application.
  const trackedIds = Object.keys(statuses).filter(
    (id) => statuses[id] !== "not_interested",
  );
  const exportCsv = () => {
    const header = [
      "company",
      "title",
      "status",
      "dateApplied",
      "note",
      "locations",
      "applyUrl",
      "datePosted",
    ];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [header.join(",")];
    for (const id of trackedIds) {
      const m = meta[id];
      lines.push(
        [
          m?.company ?? "",
          m?.title ?? "",
          STATUS_LABEL[statuses[id]],
          m?.appliedAt ?? "",
          notes[id] ?? "",
          (m?.locations ?? []).join(" | "),
          m?.applyUrl ?? "",
          m?.datePosted ?? "",
        ]
          .map((v) => esc(String(v)))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "earlybird-applications.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Live: roles that appeared since you opened the page */}
      {incoming.length > 0 && (
        <div className="sticky top-3 z-30 mb-3 flex justify-center">
          <button
            onClick={showIncoming}
            className="pop rounded-full border border-accent bg-accent px-5 py-2 text-sm font-bold text-canvas shadow-pop-lg"
          >
            ↑ {incoming.length} new role{incoming.length === 1 ? "" : "s"} — show
          </button>
        </div>
      )}

      {/* New-since-last-visit banner */}
      {unseenCount > 0 && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="pop mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-ink"
        >
          ✦ {unseenCount} new since your last visit
        </button>
      )}

      {/* Applied view filter + CSV export */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-mist p-1">
        {FILTERS.map((f) => {
          const active = appliedFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setAppliedFilter(f.key)}
              className={`rounded-md px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                active
                  ? "bg-accent text-canvas shadow-pop-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {f.label}
              <span className={active ? "text-canvas/75" : "text-ink-faint"}>
                {" "}
                {f.count}
              </span>
            </button>
          );
        })}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshState === "checking"}
            className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-soft shadow-pop-sm hover:text-ink disabled:opacity-60"
          >
            {refreshState === "checking"
              ? "⟳ Checking…"
              : refreshState === "uptodate"
                ? "✓ Up to date"
                : "⟳ Refresh"}
          </button>
          {trackedIds.length > 0 && (
            <button
              onClick={exportCsv}
              className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-soft shadow-pop-sm hover:text-ink"
            >
              ⬇ Export {trackedIds.length} tracked
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="font-display text-xl font-bold text-ink">
            {EMPTY_COPY[appliedFilter].title}
          </p>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            {EMPTY_COPY[appliedFilter].hint}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((l, i) => (
            <ListingCard
              key={l.id}
              listing={l}
              now={now}
              index={i}
              status={statuses[l.id]}
              onSetStatus={(s) => setStatus(l, s)}
              note={notes[l.id]}
              onSetNote={(t) => setNote(l.id, t)}
              appliedAt={meta[l.id]?.appliedAt}
              unseen={isUnseen(l)}
            />
          ))}
        </div>
      )}

      {/* Sentinel + status */}
      <div ref={sentinelRef} className="h-px" />
      <div className="py-8 text-center font-mono text-xs text-ink-soft">
        {loading && "loading more…"}
        {!loading && error && (
          <button onClick={loadMore} className="text-danger hover:text-accent">
            failed — retry ↻
          </button>
        )}
        {!loading && !error && !cursor && "— end of feed —"}
      </div>
    </div>
  );
}
