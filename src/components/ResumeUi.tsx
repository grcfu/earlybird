"use client";

// Shared chrome for the Resume Tailor screens.
//
// Both Gemini calls routinely run 10-20 seconds, which is long enough that a
// static "loading…" reads as a hang. So waiting states here are either a
// skeleton shaped like the content that is coming, or a spinner paired with a
// line saying what is actually happening.

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Working"
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent align-[-2px] ${className}`}
    />
  );
}

// A spinner plus a note on what is being waited for, for the multi-second calls.
export function Working({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-mist px-4 py-3">
      <Spinner className="mt-0.5" />
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-ink">
          {label}
        </p>
        {hint && <p className="mt-1 text-xs leading-relaxed text-ink-faint">{hint}</p>}
      </div>
    </div>
  );
}

// One shimmering placeholder line.
export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div className={`h-3 animate-pulse rounded bg-line ${className}`} />
  );
}

// A block of skeleton lines shaped roughly like a parsed resume section.
export function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  const widths = ["w-3/4", "w-full", "w-5/6", "w-2/3", "w-11/12"];
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine key={i} className={widths[i % widths.length]} />
      ))}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs leading-relaxed text-danger"
    >
      {children}
    </p>
  );
}

export function WarningNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-line-strong bg-mist px-4 py-3 text-xs leading-relaxed text-ink-soft">
      {children}
    </p>
  );
}

// The app's standard raised panel.
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-surface p-5 shadow-pop ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3">
      <h3 className="font-mono text-xs uppercase tracking-wider text-accent-ink">
        {children}
      </h3>
      {hint && <p className="mt-1 text-xs leading-relaxed text-ink-faint">{hint}</p>}
    </div>
  );
}

// Primary / secondary buttons, matching the pill styling used across the app.
export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  type?: "button" | "submit";
  title?: string;
}) {
  const styles = {
    primary:
      "border-accent-bright bg-accent text-canvas hover:border-accent-ink disabled:bg-mist disabled:text-ink-faint disabled:border-line",
    ghost:
      "border-line bg-surface text-ink-soft hover:text-ink hover:border-line-strong disabled:text-ink-faint",
    danger:
      "border-danger/40 bg-danger/10 text-danger hover:border-danger disabled:text-ink-faint",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`pop rounded-lg border px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-wider shadow-pop-sm transition-all disabled:cursor-not-allowed ${styles}`}
    >
      {children}
    </button>
  );
}
