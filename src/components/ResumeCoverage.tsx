"use client";

import type { CoverageStatus, TailorAnalysis } from "@/lib/resume/schema";
import { Panel, SectionTitle } from "@/components/ResumeUi";

// The three read-and-decide panels: how well the resume already covers the ad,
// what it genuinely doesn't, and which existing skills to push forward.

const STATUS_LABEL: Record<CoverageStatus, string> = {
  present: "Present",
  weak: "Weak",
  missing: "Missing",
};

// Green for covered, pink for partial, muted red for absent — the same
// vocabulary the application stages use elsewhere in the app.
const STATUS_CLASS: Record<CoverageStatus, string> = {
  present: "bg-leaf-soft text-leaf",
  weak: "bg-accent-soft text-accent-ink",
  missing: "bg-danger/15 text-danger",
};

const ORDER: CoverageStatus[] = ["missing", "weak", "present"];

export function CoverageReport({ analysis }: { analysis: TailorAnalysis }) {
  if (analysis.coverage.length === 0) return null;

  // Worst first: the missing keywords are the reason to read this at all.
  const rows = [...analysis.coverage].sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status),
  );
  const counts = {
    present: rows.filter((r) => r.status === "present").length,
    weak: rows.filter((r) => r.status === "weak").length,
    missing: rows.filter((r) => r.status === "missing").length,
  };

  return (
    <Panel>
      <SectionTitle
        hint={`${counts.present} present · ${counts.weak} weak · ${counts.missing} missing`}
      >
        Keyword coverage
      </SectionTitle>
      <ul className="divide-y divide-line">
        {rows.map((c, i) => (
          <li key={`${c.keyword}-${i}`} className="flex items-start gap-3 py-2">
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${STATUS_CLASS[c.status]}`}
            >
              {STATUS_LABEL[c.status]}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink">{c.keyword}</p>
              {c.where && (
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
                  {c.where}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function HonestGaps({ analysis }: { analysis: TailorAnalysis }) {
  if (analysis.honest_gaps.length === 0) return null;
  return (
    <Panel>
      <SectionTitle hint="Read-only, and deliberately so. These are the things the resume doesn't show — worth knowing before you apply, and not something to paper over with a reworded bullet.">
        Honest gaps
      </SectionTitle>
      <ul className="space-y-2">
        {analysis.honest_gaps.map((g, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span aria-hidden className="mt-0.5 text-ink-faint">
              —
            </span>
            <p className="text-xs leading-relaxed text-ink-soft">{g}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function SkillsToSurface({
  analysis,
  selected,
  setSelected,
}: {
  analysis: TailorAnalysis;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
}) {
  if (analysis.skills_to_surface.length === 0) return null;

  const toggle = (skill: string) => {
    const next = new Set(selected);
    if (next.has(skill)) next.delete(skill);
    else next.add(skill);
    setSelected(next);
  };

  return (
    <Panel>
      <SectionTitle hint="Skills already on your resume that this posting cares about. Checked ones move to the front of their list in the exported file — same skills, reordered.">
        Skills to surface
      </SectionTitle>
      <div className="flex flex-wrap gap-2">
        {analysis.skills_to_surface.map((s) => {
          const on = selected.has(s);
          return (
            <label
              key={s}
              className={`pop inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                on
                  ? "border-leaf-deep bg-leaf-soft text-leaf"
                  : "border-line bg-mist text-ink-soft hover:border-line-strong"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(s)}
                className="h-3 w-3 accent-leaf"
              />
              {s}
            </label>
          );
        })}
      </div>
    </Panel>
  );
}
