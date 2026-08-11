"use client";

import { useMemo, useState } from "react";
import type { TailorAnalysis } from "@/lib/resume/schema";
import { planSkillAddition, type SkillsLine } from "@/lib/resume/skills";
import { Panel, SectionTitle } from "@/components/ResumeUi";

// Skills the posting wants that the resume does not claim.
//
// This panel exists in tension with the rest of the feature, and the tension is
// the point. Everywhere else, Gemini is forbidden from adding a skill the
// resume doesn't have — that would be inventing a qualification. But there is a
// real case it was ignoring: a skill the candidate genuinely HAS and simply
// never wrote down. Only they know which those are.
//
// So nothing here is checked by default and nothing is recommended. The list is
// the ad's missing keywords, and ticking one is the user asserting it is true.
// The wording says so plainly.
//
// The second job is the line budget. These lines usually sit on exactly one
// line, and a word can wrap one to two — a whole line on a resume with none to
// spare. So adding is a swap: the preview shows what comes out.

export interface SkillAddition {
  paragraphId: string;
  label: string;
  skill: string;
}

export function SkillsToAdd({
  analysis,
  lines,
  charsPerLine,
  additions,
  setAdditions,
}: {
  analysis: TailorAnalysis;
  lines: SkillsLine[];
  charsPerLine: number;
  additions: SkillAddition[];
  setAdditions: (a: SkillAddition[]) => void;
}) {
  // The first skills line by default; most resumes only have one paragraph.
  const [lineId, setLineId] = useState(lines[0]?.id ?? "");
  const line = lines.find((l) => l.id === lineId) ?? lines[0];
  const [label, setLabel] = useState(line?.labels[0] ?? "");

  // Candidates are the keywords the coverage report called missing — the
  // things the ad wants and the resume doesn't say.
  const candidates = useMemo(() => {
    const have = new Set(
      [
        ...analysis.skills_to_surface,
        ...additions.map((a) => a.skill),
      ].map((s) => s.toLowerCase()),
    );
    return analysis.coverage
      .filter((c) => c.status === "missing")
      .map((c) => c.keyword)
      .filter((k) => !have.has(k.toLowerCase()));
  }, [analysis, additions]);

  // Apply the accepted additions in order to get the line as it will be, and
  // collect what got swapped out along the way.
  const preview = useMemo(() => {
    if (!line) return null;
    let text = line.text;
    const dropped: string[] = [];
    let stillWraps = false;
    for (const a of additions.filter((x) => x.paragraphId === line.id)) {
      const plan = planSkillAddition(
        text,
        a.label,
        a.skill,
        analysis.jd_keywords,
        charsPerLine,
      );
      if (!plan) continue;
      text = plan.text;
      dropped.push(...plan.dropped);
      stillWraps = stillWraps || plan.stillWraps;
    }
    return { text, dropped, stillWraps, changed: text !== line.text };
  }, [line, additions, analysis.jd_keywords, charsPerLine]);

  if (!line || candidates.length === 0) return null;

  const toggle = (skill: string) => {
    const on = additions.some(
      (a) => a.skill.toLowerCase() === skill.toLowerCase(),
    );
    if (on) {
      setAdditions(
        additions.filter((a) => a.skill.toLowerCase() !== skill.toLowerCase()),
      );
    } else {
      setAdditions([...additions, { paragraphId: line.id, label, skill }]);
    }
  };

  return (
    <Panel>
      <SectionTitle hint="Only tick something you can actually do. Nothing here is on your resume — ticking it is you saying it's true, not Gemini claiming it for you.">
        Add only if true
      </SectionTitle>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {lines.length > 1 && (
          <select
            value={lineId}
            onChange={(e) => {
              setLineId(e.target.value);
              const next = lines.find((l) => l.id === e.target.value);
              setLabel(next?.labels[0] ?? "");
            }}
            className="rounded-lg border border-line bg-canvas px-2 py-1 font-mono text-[11px] text-ink"
          >
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.labels.join(" / ")}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          add to
          <select
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-lg border border-line bg-canvas px-2 py-1 text-[11px] normal-case tracking-normal text-ink"
          >
            {line.labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {candidates.map((k) => {
          const on = additions.some(
            (a) => a.skill.toLowerCase() === k.toLowerCase(),
          );
          return (
            <label
              key={k}
              className={`pop inline-flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                on
                  ? "border-accent-bright bg-accent-soft text-accent-ink"
                  : "border-line bg-mist text-ink-soft hover:border-line-strong"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(k)}
                className="h-3 w-3 accent-accent"
              />
              {k}
            </label>
          );
        })}
      </div>

      {preview?.changed && (
        <div className="mt-4 rounded-xl border border-line bg-mist p-3">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            Skills line becomes
          </p>
          <p className="text-xs leading-relaxed text-ink">{preview.text}</p>

          {preview.dropped.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-accent-ink">
              Swapped out to keep it on one line:{" "}
              <span className="line-through">{preview.dropped.join(", ")}</span>
              . Nothing the posting asked for is ever dropped.
            </p>
          )}
          {preview.dropped.length === 0 && (
            <p className="mt-2 text-[11px] text-ink-faint">
              Fits on the same line — nothing had to come out.
            </p>
          )}
          {preview.stillWraps && (
            <p className="mt-2 text-[11px] leading-relaxed text-danger">
              This still runs onto a second line. Everything left is something
              the posting asked for, so nothing was dropped — untick one of
              these, or shorten the line yourself.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
