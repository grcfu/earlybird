"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CATEGORY_ORDER, CATEGORY_META } from "@/lib/categories";

type Channel = "EMAIL" | "DISCORD" | "TELEGRAM";
type Frequency = "INSTANT" | "DAILY_DIGEST";

interface Preference {
  id: string;
  categories: string[];
  keywords: string[];
  locationsFilter: string[];
  activeOnly: boolean;
  enabled: boolean;
  channel: Channel;
  channelTarget: string;
  frequency: Frequency;
  recencyWindowHours: number;
  digestHour: number;
}

const WINDOWS = [
  { v: 24, label: "24 hours" },
  { v: 48, label: "2 days" },
  { v: 168, label: "7 days" },
  { v: 720, label: "30 days" },
];

const CHANNEL_HELP: Record<Channel, { placeholder: string; help: string }> = {
  EMAIL: { placeholder: "you@example.com", help: "Leave blank to use your account email." },
  DISCORD: {
    placeholder: "https://discord.com/api/webhooks/…",
    help: "Server Settings → Integrations → Webhooks → Copy URL.",
  },
  TELEGRAM: {
    placeholder: "123456:ABC-DEF…|987654321",
    help: 'Format: "botToken|chatId" (from @BotFather + your chat id).',
  },
};

const emptyForm = {
  id: undefined as string | undefined,
  categories: new Set<string>(),
  keywords: "",
  locationsFilter: "",
  channel: "EMAIL" as Channel,
  channelTarget: "",
  frequency: "INSTANT" as Frequency,
  recencyWindowHours: 48,
  digestHour: 8,
  activeOnly: true,
};

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [loadedEmail, setLoadedEmail] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preference[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (e: string) => {
    const res = await fetch(`/api/preferences?email=${encodeURIComponent(e)}`);
    const data = await res.json();
    setPrefs(data.preferences ?? []);
    setLoadedEmail(e);
  }, []);

  const onLoad = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await load(email.trim().toLowerCase());
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => setForm(emptyForm);

  const editPref = (p: Preference) => {
    setForm({
      id: p.id,
      categories: new Set(p.categories),
      keywords: p.keywords.join(", "),
      locationsFilter: p.locationsFilter.join(", "),
      channel: p.channel,
      channelTarget: p.channelTarget,
      frequency: p.frequency,
      recencyWindowHours: p.recencyWindowHours,
      digestHour: p.digestHour,
      activeOnly: p.activeOnly,
    });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const save = async () => {
    if (!loadedEmail) {
      setStatus({ kind: "err", msg: "Load your email first." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          email: loadedEmail,
          categories: [...form.categories],
          keywords: splitList(form.keywords),
          locationsFilter: splitList(form.locationsFilter),
          channel: form.channel,
          channelTarget: form.channelTarget,
          frequency: form.frequency,
          recencyWindowHours: form.recencyWindowHours,
          digestHour: form.digestHour,
          activeOnly: form.activeOnly,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setStatus({ kind: "ok", msg: form.id ? "Alert updated." : "Alert created." });
      resetForm();
      await load(loadedEmail);
    } catch (err) {
      setStatus({ kind: "err", msg: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!loadedEmail) return;
    setBusy(true);
    try {
      await fetch(
        `/api/preferences?id=${id}&email=${encodeURIComponent(loadedEmail)}`,
        { method: "DELETE" },
      );
      await load(loadedEmail);
    } finally {
      setBusy(false);
    }
  };

  const help = CHANNEL_HELP[form.channel];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-10 sm:pt-16">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="pop rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[11px] text-accent-deep shadow-pop-sm hover:border-accent-bright"
        >
          ← back to feed
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
          alert settings
        </span>
      </div>

      <h1 className="mt-7 font-display text-4xl font-extrabold text-ink sm:text-5xl">
        Your <span className="text-accent">alerts</span>
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-soft">
        Get pinged the moment matching roles appear — by email, Discord, or
        Telegram. Identify yourself by email (no password needed for v1).
      </p>

      {/* Email gate */}
      <div className="mt-8 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onLoad()}
          placeholder="you@example.com"
          className="flex-1 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-accent-bright focus:outline-none focus:ring-2 focus:ring-accent-soft"
        />
        <button
          onClick={onLoad}
          disabled={busy}
          className="pop rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-canvas shadow-pop-sm hover:bg-accent-deep disabled:opacity-50"
        >
          Load
        </button>
      </div>

      {status && (
        <p
          className={`mt-3 inline-block rounded-lg border px-3 py-1 font-mono text-xs ${
            status.kind === "ok"
              ? "border-leaf/30 bg-leaf-soft text-leaf"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {status.msg}
        </p>
      )}

      {loadedEmail && (
        <>
          {/* Existing rules */}
          <h2 className="mt-10 font-mono text-[11px] uppercase tracking-widest text-ink-faint">
            rules for {loadedEmail}
          </h2>
          <div className="mt-3 flex flex-col gap-2.5">
            {prefs.length === 0 && (
              <p className="font-mono text-xs text-ink-faint">No alerts yet — add one below.</p>
            )}
            {prefs.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-pop-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                    <span className="rounded-md border border-line bg-accent-soft px-2 py-0.5 font-medium text-accent-ink">
                      {p.channel}
                    </span>
                    <span className="text-ink-soft">{p.frequency === "INSTANT" ? "instant" : `digest @ ${p.digestHour}:00 UTC`}</span>
                    <span className="text-ink-faint">· {p.recencyWindowHours}h window</span>
                    {!p.enabled && <span className="font-medium text-danger">· paused</span>}
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-ink-faint">
                    {p.categories.length ? p.categories.join(", ") : "all categories"}
                    {p.keywords.length ? ` · kw: ${p.keywords.join(", ")}` : ""}
                    {p.locationsFilter.length ? ` · loc: ${p.locationsFilter.join(", ")}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => editPref(p)}
                    className="font-mono text-[11px] text-accent-deep hover:text-accent"
                  >
                    edit
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="font-mono text-[11px] text-ink-faint hover:text-danger"
                  >
                    delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Editor */}
          <div className="mt-10 rounded-xl border border-line bg-surface p-5 shadow-pop">
            <h2 className="font-display text-2xl font-bold text-ink">
              {form.id ? "Edit alert" : "New alert"}
            </h2>

            {/* Categories */}
            <Field label="categories" hint="empty = all">
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ORDER.map((key) => {
                  const meta = CATEGORY_META[key];
                  const on = form.categories.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() =>
                        setForm((f) => {
                          const next = new Set(f.categories);
                          on ? next.delete(key) : next.add(key);
                          return { ...f, categories: next };
                        })
                      }
                      className="rounded-md border px-3 py-1 font-mono text-[11px]"
                      style={{
                        color: on ? "var(--color-canvas)" : meta.color,
                        background: on
                          ? meta.color
                          : "color-mix(in oklab, " + meta.color + " 16%, var(--color-surface))",
                        borderColor: on
                          ? meta.color
                          : "color-mix(in oklab, " + meta.color + " 38%, var(--color-surface))",
                      }}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            {/* Keywords + locations */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="title keywords" hint="comma-separated, any-match">
                <TextInput
                  value={form.keywords}
                  onChange={(v) => setForm((f) => ({ ...f, keywords: v }))}
                  placeholder="backend, machine learning"
                />
              </Field>
              <Field label="locations" hint="comma-separated, any-match">
                <TextInput
                  value={form.locationsFilter}
                  onChange={(v) => setForm((f) => ({ ...f, locationsFilter: v }))}
                  placeholder="new york, remote"
                />
              </Field>
            </div>

            {/* Channel + target */}
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <Field label="channel">
                <Select
                  value={form.channel}
                  onChange={(v) => setForm((f) => ({ ...f, channel: v as Channel }))}
                  options={[
                    ["EMAIL", "Email"],
                    ["DISCORD", "Discord"],
                    ["TELEGRAM", "Telegram"],
                  ]}
                />
              </Field>
              <Field label="deliver to" hint={help.help}>
                <TextInput
                  value={form.channelTarget}
                  onChange={(v) => setForm((f) => ({ ...f, channelTarget: v }))}
                  placeholder={help.placeholder}
                />
              </Field>
            </div>

            {/* Frequency + window + digest hour */}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="frequency">
                <Select
                  value={form.frequency}
                  onChange={(v) => setForm((f) => ({ ...f, frequency: v as Frequency }))}
                  options={[
                    ["INSTANT", "Instant"],
                    ["DAILY_DIGEST", "Daily digest"],
                  ]}
                />
              </Field>
              <Field label="recency window">
                <Select
                  value={String(form.recencyWindowHours)}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, recencyWindowHours: Number(v) }))
                  }
                  options={WINDOWS.map((w) => [String(w.v), w.label])}
                />
              </Field>
              {form.frequency === "DAILY_DIGEST" && (
                <Field label="digest hour (UTC)">
                  <Select
                    value={String(form.digestHour)}
                    onChange={(v) => setForm((f) => ({ ...f, digestHour: Number(v) }))}
                    options={Array.from({ length: 24 }, (_, h) => [
                      String(h),
                      `${String(h).padStart(2, "0")}:00`,
                    ])}
                  />
                </Field>
              )}
            </div>

            {/* Active only */}
            <label className="mt-5 flex items-center gap-2 font-mono text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={form.activeOnly}
                onChange={(e) => setForm((f) => ({ ...f, activeOnly: e.target.checked }))}
                className="h-4 w-4 accent-accent"
              />
              only alert about active (still-open) roles
            </label>

            <div className="mt-6 flex gap-2">
              <button
                onClick={save}
                disabled={busy}
                className="pop rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-canvas shadow-pop-sm hover:bg-accent-deep disabled:opacity-50"
              >
                {form.id ? "Update alert" : "Create alert"}
              </button>
              {form.id && (
                <button
                  onClick={resetForm}
                  className="rounded-lg border border-line bg-surface px-4 py-2 font-mono text-xs text-ink-soft hover:bg-mist hover:text-ink"
                >
                  cancel edit
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
          {label}
        </span>
        {hint && <span className="font-mono text-[10px] text-ink-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent-bright focus:outline-none focus:ring-2 focus:ring-accent-soft"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink focus:border-accent-bright focus:outline-none focus:ring-2 focus:ring-accent-soft"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v} className="bg-surface">
          {label}
        </option>
      ))}
    </select>
  );
}
