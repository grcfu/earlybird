"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApplicationRow } from "@/lib/apptracker/store";
import {
  STAGE_ORDER,
  STAGE_LABEL,
  STAGE_CLASS,
  type AppStageKey,
} from "@/lib/apptracker/stages";
import {
  getTrackerKey,
  setTrackerKey,
  generateTrackerKey,
} from "@/lib/apptracker/key";
import { buildAppsScript } from "@/lib/apptracker/appsScript";

// When you last exported, so we can nudge only when there's something new.
const EXPORT_KEY = "earlybird:apps:lastExport";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

type Filter = AppStageKey | "all";

export function ApplicationsView({
  signedIn,
  accountKey,
}: {
  signedIn: boolean;
  accountKey: string | null;
}) {
  const router = useRouter();
  const [key, setKey] = useState<string | null>(null);
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [setupOpen, setSetupOpen] = useState(false);
  const [copied, setCopied] = useState<"" | "key" | "script" | "sheets">("");
  const [endpoint, setEndpoint] = useState("");
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [restoreInput, setRestoreInput] = useState("");
  const [keyError, setKeyError] = useState("");

  const fetchApps = useCallback(async (k: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/applications?key=${encodeURIComponent(k)}`);
      const data = await res.json();
      if (data.ok) setApps(data.applications as ApplicationRow[]);
    } catch {
      /* transient */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Hydrate once after mount. When signed in, the key comes from the account
    // (server prop); when signed out, from this browser's localStorage.
    /* eslint-disable react-hooks/set-state-in-effect */
    setEndpoint(`${window.location.origin}/api/applications/ingest`);
    try {
      setLastExport(localStorage.getItem(EXPORT_KEY));
    } catch {
      /* ignore */
    }
    if (signedIn) {
      if (accountKey) {
        setKey(accountKey);
        fetchApps(accountKey);
      } else {
        setSetupOpen(true);
      }
    } else {
      const k = getTrackerKey();
      setKey(k);
      if (!k) setSetupOpen(true);
      if (k) fetchApps(k);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchApps, signedIn, accountKey]);

  const markExported = () => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(EXPORT_KEY, now);
    } catch {
      /* ignore */
    }
    setLastExport(now);
  };

  // Attach a key to the signed-in account (new or an existing one being claimed).
  const claimKey = useCallback(
    async (k: string) => {
      setKeyError("");
      const res = await fetch("/api/tracker-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: k }),
      });
      const data = await res.json();
      if (data.ok) {
        setKey(k);
        fetchApps(k);
        router.refresh(); // sync the server-side accountKey prop
      } else {
        setKeyError(data.error ?? "Couldn't set that key.");
      }
    },
    [fetchApps, router],
  );

  const handleGenerate = () => {
    const k = generateTrackerKey();
    setSetupOpen(true);
    if (signedIn) {
      claimKey(k);
    } else {
      setTrackerKey(k);
      setKey(k);
    }
  };

  // Paste an existing key: signed in → link it to your account (migrates data
  // tracked before sign-in); signed out → restore into this browser.
  const handleRestore = () => {
    const k = restoreInput.trim();
    if (k.length < 16) return;
    setRestoreInput("");
    if (signedIn) {
      claimKey(k);
    } else {
      setTrackerKey(k);
      setKey(k);
      fetchApps(k);
    }
  };

  const copy = (text: string, which: "key" | "script") => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(""), 1500);
    });
  };

  const remove = async (id: string) => {
    if (!key) return;
    setApps((prev) => prev.filter((a) => a.id !== id));
    await fetch(
      `/api/applications?key=${encodeURIComponent(key)}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  };

  // Export helpers — one CSV file, or tab-separated text you can paste straight
  // into a Google Sheet (row per application).
  const EXPORT_HEADER = ["Company", "Role", "Stage", "Applied", "Last update", "Source"];
  const exportRows = () =>
    apps.map((a) => [
      a.company,
      a.role,
      STAGE_LABEL[a.stage],
      a.appliedAt ? a.appliedAt.slice(0, 10) : "",
      a.eventDate.slice(0, 10),
      a.source,
    ]);

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      EXPORT_HEADER.map(esc).join(","),
      ...exportRows().map((r) => r.map((v) => esc(String(v))).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = "earlybird-applications.csv";
    el.click();
    URL.revokeObjectURL(url);
    markExported();
  };

  const copyForSheets = () => {
    const tsv = [
      EXPORT_HEADER.join("\t"),
      ...exportRows().map((r) => r.join("\t")),
    ].join("\n");
    navigator.clipboard?.writeText(tsv).then(() => {
      setCopied("sheets");
      setTimeout(() => setCopied(""), 1500);
      markExported();
    });
  };

  // Applications added or updated since the last export — the only time it's
  // actually worth exporting again, so that's the only time we nudge.
  const unexported = lastExport
    ? apps.filter((a) => new Date(a.updatedAt).getTime() > new Date(lastExport).getTime())
    : apps;

  const countIn = (f: Filter) =>
    f === "all" ? apps.length : apps.filter((a) => a.stage === f).length;
  const visible = filter === "all" ? apps : apps.filter((a) => a.stage === filter);

  const script = key ? buildAppsScript(key, endpoint) : "";

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    ...STAGE_ORDER.map((s) => ({ key: s as Filter, label: STAGE_LABEL[s] })),
  ];

  return (
    <div>
      {/* Count header */}
      <div className="mb-6 flex items-baseline gap-3">
        <span className="font-display text-6xl font-extrabold tabular-nums text-accent sm:text-7xl">
          {apps.length.toLocaleString()}
        </span>
        <span className="text-2xl font-semibold text-ink sm:text-3xl">
          {apps.length === 1 ? "application" : "applications"} tracked
        </span>
      </div>

      {/* Setup toggle */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setSetupOpen((o) => !o)}
          className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-soft shadow-pop-sm hover:text-ink"
        >
          {setupOpen ? "▾ hide setup" : "⚙ email auto-tracking setup"}
        </button>
        {key && (
          <button
            onClick={() => fetchApps(key)}
            className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-soft shadow-pop-sm hover:text-ink"
          >
            {loading ? "⟳ …" : "⟳ Refresh"}
          </button>
        )}
        {apps.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {lastExport && (
              <span className="font-mono text-[10px] text-ink-faint">
                exported {fmtDate(lastExport)}
              </span>
            )}
            <button
              onClick={copyForSheets}
              title="Copy as tab-separated text — paste straight into a Google Sheet"
              className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-soft shadow-pop-sm hover:text-ink"
            >
              {copied === "sheets" ? "✓ copied" : "⧉ Copy for Sheets"}
            </button>
            <button
              onClick={exportCsv}
              title="Download all tracked applications as a CSV file"
              className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-ink-soft shadow-pop-sm hover:text-ink"
            >
              ⬇ Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Setup panel */}
      {setupOpen && (
        <div className="mb-6 rounded-xl border border-line bg-surface p-4 shadow-pop">
          <p className="font-display text-lg font-bold text-ink">
            Auto-track applications from Gmail
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            A tiny Google Apps Script reads job emails you label{" "}
            <span className="font-mono text-accent-ink">EarlyBird</span> and logs
            each application here — applied, assessment, interview, offer, or
            rejected — with the date. Forward your WUSTL mail into Gmail and it&apos;s
            covered too. Run it in each Gmail account.
          </p>

          {/* Account status: signed in = safe across browsers; signed out =
              tied to this browser only. */}
          {signedIn ? (
            <p className="mt-2 rounded-md border border-leaf/30 bg-leaf-soft px-3 py-1.5 font-mono text-[11px] text-leaf">
              ✓ Signed in — your tracker is tied to your Google account. Sign in
              on any browser and it&apos;s all here.
            </p>
          ) : (
            <p className="mt-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-1.5 font-mono text-[11px] text-accent-ink">
              Tip: Sign in with Google (top-right) to tie this to your account —
              then you never need the key again, on any browser.
            </p>
          )}

          {!key ? (
            <div className="mt-3 space-y-3">
              <button
                onClick={handleGenerate}
                className="pop rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas shadow-pop-sm hover:bg-accent-deep"
              >
                Generate my tracker key
              </button>

              {/* Restore/claim path — signed in: link an existing key (migrates
                  data tracked before sign-in); signed out: restore into this
                  browser after a wipe. */}
              <div className="border-t border-line pt-3">
                <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  {signedIn
                    ? "Have a key from before? Paste it to link your data"
                    : "Already have a key? Paste it to restore"}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={restoreInput}
                    onChange={(e) => setRestoreInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRestore()}
                    placeholder="eb_…"
                    aria-label="Paste your existing tracker key"
                    className="min-w-0 flex-1 rounded-md border border-line bg-canvas px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent-bright focus:outline-none focus:ring-2 focus:ring-accent-soft"
                  />
                  <button
                    onClick={handleRestore}
                    disabled={restoreInput.trim().length < 16}
                    className="pop shrink-0 rounded-md border border-line bg-mist px-3 py-1.5 font-mono text-[11px] text-ink-soft hover:text-ink disabled:opacity-50"
                  >
                    {signedIn ? "Link" : "Restore"}
                  </button>
                </div>
                {keyError && (
                  <p className="mt-1 font-mono text-[10px] text-danger">{keyError}</p>
                )}
                <p className="mt-1 font-mono text-[10px] text-ink-faint">
                  It&apos;s also saved in your Gmail Apps Script (the KEY line).
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                  1 · Your key{signedIn ? " (tied to your account)" : " (kept in this browser)"}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-canvas px-2 py-1.5 font-mono text-xs text-ink-soft">
                    {key}
                  </code>
                  <button
                    onClick={() => copy(key, "key")}
                    className="pop shrink-0 rounded-md border border-line bg-mist px-2.5 py-1.5 font-mono text-[11px] text-ink-soft hover:text-ink"
                  >
                    {copied === "key" ? "✓" : "copy"}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                    2 · Paste into script.google.com → Save → run once → add a
                    15-min trigger
                  </div>
                  <button
                    onClick={() => copy(script, "script")}
                    className="pop shrink-0 rounded-md border border-line bg-mist px-2.5 py-1.5 font-mono text-[11px] text-ink-soft hover:text-ink"
                  >
                    {copied === "script" ? "✓ copied" : "copy script"}
                  </button>
                </div>
                <pre className="mt-1 max-h-48 overflow-auto rounded-md border border-line bg-canvas p-3 font-mono text-[10px] leading-relaxed text-ink-soft">
                  {script}
                </pre>
              </div>

              <div className="font-mono text-[11px] text-ink-faint">
                3 · In Gmail, make a label{" "}
                <span className="text-accent-ink">EarlyBird</span> and a filter
                that applies it to job emails (and to your forwarded WUSTL mail).
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export nudge — only when there's new/updated stuff since last export */}
      {apps.length > 0 && unexported.length > 0 && (
        <div className="pop mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-2.5">
          <span className="text-sm font-semibold text-accent-ink">
            🔔 {unexported.length}{" "}
            {unexported.length === 1 ? "application" : "applications"}{" "}
            {lastExport
              ? `added or updated since your last export (${fmtDate(lastExport)})`
              : "ready to export"}{" "}
            — keep your sheet in sync.
          </span>
          <button
            onClick={copyForSheets}
            className="pop shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-canvas shadow-pop-sm hover:bg-accent-deep"
          >
            {copied === "sheets" ? "✓ copied" : "Copy for Sheets"}
          </button>
        </div>
      )}

      {/* Empty / list */}
      {apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="font-display text-xl font-bold text-ink">
            No applications tracked yet.
          </p>
          <p className="mt-1 font-mono text-xs text-ink-soft">
            {key
              ? "Once your Gmail script runs, applications appear here automatically."
              : "Generate a key above to set up email auto-tracking."}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-line bg-mist p-1">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-md px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${
                    active
                      ? "bg-accent text-canvas shadow-pop-sm"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {f.label}
                  <span className={active ? "text-canvas/75" : "text-ink-faint"}>
                    {" "}
                    {countIn(f.key)}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            {visible.map((a) => (
              <article
                key={a.id}
                className="pop flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-pop"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="truncate text-[15px] font-bold text-ink">
                      {a.company}
                    </span>
                    <span
                      className={`rounded-md px-2 py-[1px] font-mono text-[10px] uppercase tracking-wider ${STAGE_CLASS[a.stage]}`}
                    >
                      {STAGE_LABEL[a.stage]}
                    </span>
                  </div>
                  {a.role && (
                    <div className="mt-0.5 truncate font-mono text-[12px] text-ink-soft">
                      {a.role}
                    </div>
                  )}
                  <div className="mt-1 font-mono text-[11px] text-ink-faint">
                    {a.appliedAt ? `applied ${fmtDate(a.appliedAt)}` : ""}
                    {a.stage === "REJECTED" || a.stage === "OFFER"
                      ? ` · ${STAGE_LABEL[a.stage].toLowerCase()} ${fmtDate(a.eventDate)}`
                      : ""}
                  </div>
                </div>
                <button
                  onClick={() => remove(a.id)}
                  title="Remove"
                  aria-label="Remove application"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-canvas text-xs text-ink-faint hover:border-danger hover:text-danger"
                >
                  ✕
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
