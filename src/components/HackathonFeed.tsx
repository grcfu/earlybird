"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HackathonPage, HackathonRow } from "@/lib/hackathons";
import { HackathonCard } from "@/components/HackathonCard";
import {
  isRegistered,
  isHackInterested,
  type HackTrackStatus,
} from "@/lib/hackathon-track";

// Per-browser tracking (anonymous feed → localStorage). Namespaced under :hack:
// so it never collides with the internships tracker.
const STATUS_KEY = "earlybird:hack:status";
const NOTES_KEY = "earlybird:hack:notes";
const META_KEY = "earlybird:hack:meta";
const LASTVISIT_KEY = "earlybird:hack:lastVisit";

interface TrackedMeta {
  name: string;
  url: string;
  dateLabel: string | null;
  locationLabel: string;
  source: string;
  registeredAt?: string; // YYYY-MM-DD, set when first marked registered/submitted
}

type Tab = "all" | "interested" | "registered" | "notinterested";

const EMPTY_COPY: Record<Tab, { title: string; hint: string }> = {
  all: {
    title: "No hackathons in this view.",
    hint: "Try widening the timeframe or switching format.",
  },
  interested: {
    title: "Nothing marked interested yet.",
    hint: "Set a hackathon to Interested to collect it here.",
  },
  registered: {
    title: "No registrations tracked yet.",
    hint: "Mark a hackathon Registered once you sign up.",
  },
  notinterested: {
    title: "Nothing dismissed.",
    hint: "Hackathons you mark Not interested show up here.",
  },
};

export function HackathonFeed({
  initial,
  query,
  serverNow,
  search,
}: {
  initial: HackathonPage;
  query: string;
  serverNow: number;
  search?: string | null;
}) {
  const [items, setItems] = useState<HackathonRow[]>(initial.hackathons);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(serverNow);

  const [statuses, setStatuses] = useState<Record<string, HackTrackStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [, setMeta] = useState<Record<string, TrackedMeta>>({});
  const [tab, setTab] = useState<Tab>("all");
  const [lastVisit, setLastVisit] = useState<number | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const rawStatus = localStorage.getItem(STATUS_KEY);
      setStatuses(rawStatus ? JSON.parse(rawStatus) : {});
      const rawNotes = localStorage.getItem(NOTES_KEY);
      if (rawNotes) setNotes(JSON.parse(rawNotes));
      const rawMeta = localStorage.getItem(META_KEY);
      if (rawMeta) setMeta(JSON.parse(rawMeta));
      const lv = localStorage.getItem(LASTVISIT_KEY);
      setLastVisit(lv ? Number(lv) : null);
      localStorage.setItem(LASTVISIT_KEY, String(Date.now()));
    } catch {
      /* ignore malformed storage */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const isUnseen = useCallback(
    (h: HackathonRow) =>
      lastVisit != null && new Date(h.firstSeenAt).getTime() > lastVisit,
    [lastVisit],
  );

  const setStatus = useCallback(
    (h: HackathonRow, status: HackTrackStatus | "") => {
      const id = h.id;
      setStatuses((prev) => {
        const next = { ...prev };
        if (status) next[id] = status;
        else delete next[id];
        try {
          localStorage.setItem(STATUS_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      setMeta((prev) => {
        const next = { ...prev };
        if (status) {
          const existing = next[id] ?? {
            name: h.name,
            url: h.url,
            dateLabel: h.dateLabel,
            locationLabel: h.locationLabel,
            source: h.source,
          };
          if (isRegistered(status) && !existing.registeredAt) {
            existing.registeredAt = new Date().toISOString().slice(0, 10);
          }
          next[id] = existing;
        } else {
          delete next[id];
        }
        try {
          localStorage.setItem(META_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
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
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Live refresh: poll the first page and buffer events we don't already have.
  const [incoming, setIncoming] = useState<HackathonRow[]>([]);
  const idsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    idsRef.current = new Set([
      ...items.map((h) => h.id),
      ...incoming.map((h) => h.id),
    ]);
  }, [items, incoming]);

  const checkForNew = useCallback(async (): Promise<HackathonRow[]> => {
    try {
      const res = await fetch(`/api/hackathons?${query}`);
      if (!res.ok) return [];
      const page: HackathonPage = await res.json();
      return page.hackathons.filter((h) => !idsRef.current.has(h.id));
    } catch {
      return [];
    }
  }, [query]);

  useEffect(() => {
    const poll = async () => {
      const fresh = await checkForNew();
      if (fresh.length) setIncoming((prev) => [...fresh, ...prev]);
    };
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [checkForNew]);

  const [refreshState, setRefreshState] = useState<
    "idle" | "checking" | "uptodate"
  >("idle");
  const handleRefresh = useCallback(async () => {
    setRefreshState("checking");
    const fresh = await checkForNew();
    if (fresh.length || incoming.length) {
      setItems((prev) => [...fresh, ...incoming, ...prev]);
      setIncoming([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setRefreshState("idle");
    } else {
      setRefreshState("uptodate");
      setTimeout(() => setRefreshState("idle"), 2000);
    }
  }, [checkForNew, incoming]);

  const showIncoming = useCallback(() => {
    setItems((prev) => [...incoming, ...prev]);
    setIncoming([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [incoming]);

  const loadMore = useCallback(async () => {
    if (loading || !cursor) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(
        `/api/hackathons?${query}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page: HackathonPage = await res.json();
      setItems((prev) => [...prev, ...page.hackathons]);
      setCursor(page.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, cursor, query]);

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

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-20 text-center">
        <p className="font-display text-2xl font-bold text-ink">
          {search ? `No hackathons match “${search}”.` : "No upcoming hackathons here."}
        </p>
        <p className="mt-2 font-mono text-xs text-ink-soft">
          {search
            ? "Try a different spelling, or clear the search."
            : "Try widening the timeframe or switching format."}
        </p>
      </div>
    );
  }

  const notInterested = (id: string) => statuses[id] === "not_interested";
  const inTab = (h: HackathonRow, t: Tab): boolean => {
    switch (t) {
      case "all":
        return !notInterested(h.id);
      case "interested":
        return isHackInterested(statuses[h.id]);
      case "registered":
        return isRegistered(statuses[h.id]);
      case "notinterested":
        return notInterested(h.id);
    }
  };
  const countIn = (t: Tab) =>
    items.reduce((n, h) => (inTab(h, t) ? n + 1 : n), 0);

  const TABS: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "interested", label: "Interested" },
    { key: "registered", label: "Registered" },
    { key: "notinterested", label: "Not interested" },
  ];

  const visible = items.filter((h) => inTab(h, tab));
  const unseenCount = items.reduce((n, h) => (isUnseen(h) ? n + 1 : n), 0);

  return (
    <div>
      {incoming.length > 0 && (
        <div className="sticky top-3 z-30 mb-3 flex justify-center">
          <button
            onClick={showIncoming}
            className="pop rounded-full border border-accent bg-accent px-5 py-2 text-sm font-bold text-canvas shadow-pop-lg"
          >
            ↑ {incoming.length} new hackathon{incoming.length === 1 ? "" : "s"} — show
          </button>
        </div>
      )}

      {unseenCount > 0 && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="pop mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent-ink"
        >
          ✦ {unseenCount} new since your last visit
        </button>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-mist p-1">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                  active
                    ? "bg-accent text-canvas shadow-pop-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {t.label}
                <span className={active ? "text-canvas/75" : "text-ink-faint"}>
                  {" "}
                  {countIn(t.key)}
                </span>
              </button>
            );
          })}
        </div>
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
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="font-display text-xl font-bold text-ink">
            {EMPTY_COPY[tab].title}
          </p>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            {EMPTY_COPY[tab].hint}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((h, i) => (
            <HackathonCard
              key={h.id}
              hackathon={h}
              now={now}
              index={i}
              status={statuses[h.id]}
              onSetStatus={(s) => setStatus(h, s)}
              note={notes[h.id]}
              onSetNote={(t) => setNote(h.id, t)}
              unseen={isUnseen(h)}
            />
          ))}
        </div>
      )}

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
