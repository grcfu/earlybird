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
}: {
  resume: StoredResume;
  analysis: TailorAnalysis | null;
  accepted: Set<string>;
  company: string;
  surfaced: Set<string>;
}) {
  const [downloading, setDownloading] = useState(false);
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
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const note = res.headers.get("x-resume-notes");
      if (note) setNotes(note.split("; ").filter(Boolean));

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
  }, [company, edits, additions, surfaced, filename]);

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
          {total === 0 && (
            <span className="font-mono text-[10px] text-ink-faint">
              No edits accepted — this downloads your resume unchanged.
            </span>
          )}
        </div>
      </Panel>

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
