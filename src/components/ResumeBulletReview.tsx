"use client";

import { useMemo, useState } from "react";
import type { BulletSuggestion, TailorAnalysis } from "@/lib/resume/schema";
import { diffSegments, placeholdersIn } from "@/lib/resume/diff";
import { Panel, SectionTitle } from "@/components/ResumeUi";

// The bullet review: one card per suggestion, each an in-place toggle between
// what the resume says now and what Gemini proposes, with an explicit accept.
//
// Nothing is accepted by default. A tailored resume is a claim the candidate
// makes about themselves, so every changed line has to be an act rather than an
// omission — and the bracket rule means some suggestions arrive deliberately
// unfinished, carrying "[X]%" for the user to fill in.

// A suggestion's stable handle: its bullet id, or its position for a new one.
export function suggestionKey(s: BulletSuggestion, i: number): string {
  return s.bulletId || `new:${i}`;
}

function DiffText({ original, revised }: { original: string; revised: string }) {
  const segments = useMemo(
    () => diffSegments(original, revised),
    [original, revised],
  );
  return (
    <p className="text-xs leading-relaxed text-ink">
      {segments.map((seg, i) => {
        if (seg.kind === "same") return <span key={i}>{seg.text}</span>;
        if (seg.kind === "placeholder") {
          return (
            <mark
              key={i}
              title="Gemini invented this — replace it with your real figure before sending"
              className="rounded bg-danger/20 px-0.5 font-medium text-danger"
            >
              {seg.text}
            </mark>
          );
        }
        return (
          <mark key={i} className="rounded bg-leaf-soft px-0.5 text-leaf">
            {seg.text}
          </mark>
        );
      })}
    </p>
  );
}

function Toggle({
  showing,
  onChange,
  disabled,
}: {
  showing: "original" | "revised";
  onChange: (v: "original" | "revised") => void;
  disabled?: boolean;
}) {
  const on = showing === "revised";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Show AI suggestion instead of the original"
      disabled={disabled}
      onClick={() => onChange(on ? "original" : "revised")}
      className={`pop inline-flex items-center gap-2 rounded-lg border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
        on
          ? "border-leaf-deep bg-leaf-soft text-leaf"
          : "border-line bg-mist text-ink-faint hover:text-ink-soft"
      }`}
    >
      <span
        aria-hidden
        className={`relative h-3 w-6 rounded-full transition-colors ${on ? "bg-leaf-deep" : "bg-line-strong"}`}
      >
        <span
          className={`absolute top-0.5 h-2 w-2 rounded-full bg-canvas transition-all ${on ? "left-3.5" : "left-0.5"}`}
        />
      </span>
      {on ? "AI suggestion" : "Original"}
    </button>
  );
}

function SuggestionCard({
  suggestion,
  accepted,
  onAccept,
  onReject,
}: {
  suggestion: BulletSuggestion;
  accepted: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const isNew = !suggestion.bulletId;
  // The preview always agrees with the decision: an accepted bullet shows the
  // text the export will contain. This matters on remount too — coming back to
  // the tab must not show an accepted suggestion sitting on its original.
  const [showing, setShowing] = useState<"original" | "revised">(
    isNew || accepted ? "revised" : "original",
  );
  const placeholders = placeholdersIn(suggestion.revised);
  const text = showing === "revised" ? suggestion.revised : suggestion.original;

  return (
    <li
      className={`rounded-xl border p-3 transition-all ${
        accepted ? "border-leaf-deep bg-leaf-soft/30" : "border-line bg-mist"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
          {isNew ? "New bullet" : suggestion.bulletId}
        </span>
        {!isNew && (
          <Toggle showing={showing} onChange={setShowing} />
        )}
        {isNew && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-leaf">
            X-Y-Z format
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              onAccept();
              setShowing("revised");
            }}
            aria-pressed={accepted}
            className={`pop rounded-lg border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-all ${
              accepted
                ? "border-leaf-deep bg-leaf text-canvas"
                : "border-line bg-surface text-ink-soft hover:border-leaf-deep hover:text-leaf"
            }`}
          >
            {accepted ? "✓ Accepted" : "Accept"}
          </button>
          <button
            type="button"
            onClick={() => {
              onReject();
              setShowing(isNew ? "revised" : "original");
            }}
            disabled={!accepted}
            className="pop rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint transition-all hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reject
          </button>
        </div>
      </div>

      {showing === "revised" ? (
        <DiffText original={suggestion.original} revised={suggestion.revised} />
      ) : (
        <p className="text-xs leading-relaxed text-ink-soft">{text}</p>
      )}

      {suggestion.rationale && (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          {suggestion.rationale}
        </p>
      )}

      {placeholders.length > 0 && (
        <p className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-danger">
          Fill in {placeholders.join(", ")} before you send this — Gemini
          invented {placeholders.length === 1 ? "it" : "them"} to match the
          posting.
        </p>
      )}

      {suggestion.keywords_surfaced.length > 0 && (
        <p className="mt-2 font-mono text-[10px] text-ink-faint">
          surfaces: {suggestion.keywords_surfaced.join(", ")}
        </p>
      )}
    </li>
  );
}

export function BulletReview({
  analysis,
  accepted,
  setAccepted,
}: {
  analysis: TailorAnalysis;
  accepted: Set<string>;
  setAccepted: (s: Set<string>) => void;
}) {
  const suggestions = analysis.bullet_suggestions;
  if (suggestions.length === 0) {
    return (
      <Panel>
        <SectionTitle>Bullet review</SectionTitle>
        <p className="text-xs leading-relaxed text-ink-soft">
          No bullet edits suggested — your existing wording already fits this
          posting.
        </p>
      </Panel>
    );
  }

  const set = (key: string, on: boolean) => {
    const next = new Set(accepted);
    if (on) next.add(key);
    else next.delete(key);
    setAccepted(next);
  };

  return (
    <Panel>
      <SectionTitle
        hint={`${accepted.size} of ${suggestions.length} accepted. Nothing is applied until you accept it, and only accepted edits reach the exported file.`}
      >
        Bullet review
      </SectionTitle>
      <ul className="space-y-2.5">
        {suggestions.map((s, i) => {
          const key = suggestionKey(s, i);
          return (
            <SuggestionCard
              key={key}
              suggestion={s}
              accepted={accepted.has(key)}
              onAccept={() => set(key, true)}
              onReject={() => set(key, false)}
            />
          );
        })}
      </ul>
    </Panel>
  );
}
