"use client";

import { useCallback, useMemo, useState } from "react";
import type { TailorAnalysis } from "@/lib/resume/schema";
import { exportFilename } from "@/lib/resume/company";
import { placeholdersIn } from "@/lib/resume/diff";
import { suggestionKey } from "@/components/ResumeBulletReview";
import {
  Panel,
  Button,
  Spinner,
  ErrorNote,
  WarningNote,
  SectionTitle,
} from "@/components/ResumeUi";
import type { StoredResume } from "@/components/ResumeTailorView";
import type { CutSuggestion } from "@/lib/resume/schema";
import type { FitEstimate } from "@/lib/resume/fit";

// Export screen: what will be applied, and the download.
//
// The file is built server-side from the stored .docx and streamed back, so the
// browser never holds the resume binary and the stored base resume is never
// written to. This screen only reports what the user already approved.

export function ResumeExport({
  resume,
  analysis,
  accepted,
  company,
  surfaced,
  jd,
}: {
  resume: StoredResume;
  analysis: TailorAnalysis | null;
  accepted: Set<string>;
  company: string;
  surfaced: Set<string>;
  // Passed through to the fit check so a recommended cut is judged against the
  // posting rather than in the abstract.
  jd: string;
}) {
  const [downloading, setDownloading] = useState(false);
  // Page-fit state. Checking is opt-in per export because it costs a Gemini
  // call whenever the resume actually overflows.
  const [checking, setChecking] = useState(false);
  const [fit, setFit] = useState<FitEstimate | null>(null);
  const [cuts, setCuts] = useState<CutSuggestion[]>([]);
  const [fitInfo, setFitInfo] = useState<{ canShrink: boolean; bodyPt: number; shrunkPt: number } | null>(null);
  const [dropIds, setDropIds] = useState<Set<string>>(new Set());
  const [shrinkBody, setShrinkBody] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [done, setDone] = useState("");

  // Split the accepted suggestions into rewrites and additions.
  const { edits, additions, unfilled } = useMemo(() => {
    const edits: { bulletId: string; text: string }[] = [];
    const additions: string[] = [];
    const unfilled: string[] = [];
    for (const [i, s] of (analysis?.bullet_suggestions ?? []).entries()) {
      if (!accepted.has(suggestionKey(s, i))) continue;
      if (s.bulletId) edits.push({ bulletId: s.bulletId, text: s.revised });
      else additions.push(s.revised);
      unfilled.push(...placeholdersIn(s.revised));
    }
    return { edits, additions, unfilled: [...new Set(unfilled)] };
  }, [analysis, accepted]);

  const filename = exportFilename(resume.data.basics.name, company);
  const total = edits.length + additions.length;

  const checkFit = useCallback(async () => {
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/resume/fit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jd, edits, additions }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Couldn't check the page count.");
        return;
      }
      setFit(body.estimate as FitEstimate);
      setCuts((body.cuts ?? []) as CutSuggestion[]);
      setFitInfo({ canShrink: !!body.canShrink, bodyPt: body.bodyPt, shrunkPt: body.shrunkPt });
      if (body.cutError) setNotes([body.cutError]);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setChecking(false);
    }
  }, [jd, edits, additions]);

  const download = useCallback(async () => {
    setDownloading(true);
    setError("");
    setNotes([]);
    setDone("");
    try {
      const res = await fetch("/api/resume/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company,
          edits,
          additions,
          surfaced: [...surfaced],
          dropIds: [...dropIds],
          shrinkBody,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      // Percent-encoded server-side: header values can't carry the arrows and
      // em dashes the notes use.
      const raw = res.headers.get("x-resume-notes");
      if (raw) {
        let note = raw;
        try {
          note = decodeURIComponent(raw);
        } catch {
          /* fall back to the raw value rather than losing the report */
        }
        setNotes(note.split("; ").filter(Boolean));
      }

      // Trigger the save dialog from an object URL, then release it.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(filename);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setDownloading(false);
    }
  }, [company, edits, additions, surfaced, dropIds, shrinkBody, filename]);

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle hint="Built from your original .docx, so fonts, margins and spacing come out exactly as they went in.">
          Export
        </SectionTitle>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Rewrites", edits.length],
            ["New bullets", additions.length],
            ["Skills moved", surfaced.size],
            ["Placeholders", unfilled.length],
          ].map(([label, n]) => (
            <div
              key={label}
              className="rounded-xl border border-line bg-mist px-3 py-2"
            >
              <dt className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {label}
              </dt>
              <dd className="font-display text-xl font-bold text-ink">{n}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 font-mono text-[11px] text-ink-soft">
          Saves as{" "}
          <span className="rounded bg-mist px-1.5 py-0.5 text-accent-ink">
            {filename}
          </span>
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={download} disabled={downloading}>
            {downloading ? (
              <>
                <Spinner className="mr-1.5" /> Building…
              </>
            ) : (
              "Download tailored resume"
            )}
          </Button>
          <Button variant="ghost" onClick={checkFit} disabled={checking}>
            {checking ? (
              <>
                <Spinner className="mr-1.5" /> Checking…
              </>
            ) : (
              "Check it still fits one page"
            )}
          </Button>
          {total === 0 && (
            <span className="font-mono text-[10px] text-ink-faint">
              No edits accepted — this downloads your resume unchanged.
            </span>
          )}
        </div>
      </Panel>

      {fit && (
        <FitPanel
          fit={fit}
          cuts={cuts}
          info={fitInfo}
          dropIds={dropIds}
          setDropIds={setDropIds}
          shrinkBody={shrinkBody}
          setShrinkBody={setShrinkBody}
          bulletText={(id) =>
            resume.data.experience
              .concat(
                resume.data.projects.map((p) => ({
                  company: p.name,
                  role: "",
                  dates: "",
                  location: "",
                  bullets: p.bullets,
                })),
              )
              .flatMap((e) => e.bullets)
              .find((b) => b.id === id)?.text ?? id
          }
        />
      )}

      {unfilled.length > 0 && (
        <ErrorNote>
          {unfilled.length === 1 ? "One placeholder is" : `${unfilled.length} placeholders are`}{" "}
          still unfilled: {unfilled.join(", ")}. Gemini invented{" "}
          {unfilled.length === 1 ? "it" : "them"} to match the posting — open the
          downloaded file and replace{" "}
          {unfilled.length === 1 ? "it" : "them"} with your real figures before
          you send it.
        </ErrorNote>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {notes.map((n, i) => (
        <WarningNote key={i}>{n}</WarningNote>
      ))}

      {done && !error && (
        <p className="rounded-xl border border-leaf-deep bg-leaf-soft px-4 py-3 text-xs leading-relaxed text-leaf">
          Downloaded {done}. Your stored resume is unchanged — tailor it again
          for the next posting.
        </p>
      )}
    </div>
  );
}

// The page-fit result and the levers, in the order the user chose: squeeze
// what spacing is left, then offer a cut, then offer the font step. Nothing is
// applied automatically — every option is a control the user has to set.
function FitPanel({
  fit,
  cuts,
  info,
  dropIds,
  setDropIds,
  shrinkBody,
  setShrinkBody,
  bulletText,
}: {
  fit: FitEstimate;
  cuts: CutSuggestion[];
  info: { canShrink: boolean; bodyPt: number; shrunkPt: number } | null;
  dropIds: Set<string>;
  setDropIds: (s: Set<string>) => void;
  shrinkBody: boolean;
  setShrinkBody: (b: boolean) => void;
  bulletText: (id: string) => string;
}) {
  const toggleDrop = (id: string) => {
    const next = new Set(dropIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDropIds(next);
  };

  const tone =
    fit.verdict === "fits"
      ? "border-leaf-deep bg-leaf-soft text-leaf"
      : fit.verdict === "borderline"
        ? "border-accent-bright bg-accent-soft text-accent-ink"
        : "border-danger/40 bg-danger/10 text-danger";

  const headline =
    fit.verdict === "fits"
      ? "Looks like it still fits on one page"
      : fit.verdict === "borderline"
        ? "Right on the edge of a second page"
        : "Likely to spill onto a second page";

  return (
    <Panel>
      <SectionTitle
        hint={
          fit.calibrated
            ? `Calibrated against Word's own count for your file (${fit.wordLines} lines over ${fit.wordPages} page${fit.wordPages === 1 ? "" : "s"}).`
            : "Your file carries no page count from Word, so this is a rougher geometric estimate."
        }
      >
        Page fit
      </SectionTitle>

      <div className={`rounded-xl border px-4 py-3 ${tone}`}>
        <p className="text-xs font-medium">{headline}</p>
        <p className="mt-1 font-mono text-[10px] opacity-80">
          estimated {fit.estimatedPages} pages
          {fit.addedLines !== 0 &&
            ` · your edits ${fit.addedLines > 0 ? "add" : "save"} about ${Math.abs(fit.addedLines)} line(s)`}
        </p>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        An estimate, not a measurement — a .docx has no page count until Word
        lays it out. Check the downloaded file before you send it.
      </p>

      {fit.verdict !== "fits" && (
        <div className="mt-4 space-y-3">
          {cuts.length > 0 && (
            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-accent-ink">
                Cheapest to lose for this posting
              </p>
              <ul className="space-y-2">
                {cuts.map((c) => {
                  const on = dropIds.has(c.bulletId);
                  return (
                    <li
                      key={c.bulletId}
                      className={`rounded-xl border p-2.5 transition-all ${
                        on ? "border-danger/40 bg-danger/10" : "border-line bg-mist"
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleDrop(c.bulletId)}
                          className="mt-0.5 h-3 w-3 accent-danger"
                        />
                        <span className="min-w-0">
                          <span
                            className={`block text-xs leading-relaxed ${on ? "text-ink-faint line-through" : "text-ink"}`}
                          >
                            {bulletText(c.bulletId)}
                          </span>
                          <span className="mt-1 block text-[11px] leading-relaxed text-ink-faint">
                            {c.reason}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-line bg-mist p-2.5">
            <label
              className={`flex items-start gap-2.5 ${info?.canShrink ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="checkbox"
                checked={shrinkBody}
                disabled={!info?.canShrink}
                onChange={(e) => setShrinkBody(e.target.checked)}
                className="mt-0.5 h-3 w-3 accent-accent"
              />
              <span>
                <span className="block text-xs text-ink">
                  {info?.canShrink
                    ? `Shrink body text ${info.bodyPt}pt → ${info.shrunkPt}pt`
                    : "Font can't be stepped down on this resume"}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-ink-faint">
                  {info?.canShrink
                    ? "Headings and spacers keep their size. 10pt is the floor — below that a resume stops being comfortable to read."
                    : "It's already at the 10pt floor, or the size comes from a Word style rather than the paragraphs."}
                </span>
              </span>
            </label>
          </div>
        </div>
      )}
    </Panel>
  );
}
