"use client";

import { useCallback, useEffect, useState } from "react";
import { computeStreak, type StreakInfo } from "@/lib/streak";

// Reads the same localStorage the feed writes (appliedAt lives in the tracked
// snapshot), so the streak is derived, not separately stored.
const META_KEY = "earlybird:meta";

function readStreak(): StreakInfo {
  try {
    const raw = localStorage.getItem(META_KEY);
    const meta = raw
      ? (JSON.parse(raw) as Record<string, { appliedAt?: string }>)
      : {};
    const dates = Object.values(meta)
      .map((m) => m?.appliedAt)
      .filter((d): d is string => !!d);
    return computeStreak(dates, new Date().toISOString().slice(0, 10));
  } catch {
    return { count: 0, appliedToday: false, best: 0 };
  }
}

export function StreakBadge() {
  // null until mounted so server + first client render match (localStorage is
  // client-only). The feed dispatches "earlybird:tracked" when a status changes.
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const refresh = useCallback(() => setStreak(readStreak()), []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read localStorage post-mount (SSR-safe)
    refresh();
    window.addEventListener("earlybird:tracked", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("earlybird:tracked", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  if (!streak) return null;

  const { count, appliedToday } = streak;

  const label =
    count === 0
      ? "Start a streak"
      : `${count}-day streak${appliedToday ? "" : " · apply 1 today"}`;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 font-mono text-[11px] shadow-pop-sm ${
        appliedToday
          ? "border-leaf/40 text-leaf"
          : count > 0
            ? "border-accent/40 text-accent-ink"
            : "border-line text-ink-soft"
      }`}
      title={
        count === 0
          ? "Apply to one role today to start a streak 🐦"
          : appliedToday
            ? `You've applied today — ${count}-day streak going!`
            : `Apply to one role today to keep your ${count}-day streak alive`
      }
    >
      <span
        aria-hidden
        className={`inline-block ${appliedToday ? "animate-bird-celebrate" : "animate-bird-hop"}`}
      >
        🐦
      </span>
      {count > 0 && <span className="font-bold">🔥 {count}</span>}
      <span>{label}</span>
    </div>
  );
}
