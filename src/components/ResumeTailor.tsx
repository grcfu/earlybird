"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TailorAnalysis } from "@/lib/resume/schema";
import { guessCompany } from "@/lib/resume/company";
import { fetchWithTimeout, RequestTimeoutError } from "@/lib/resume/fetch";
import {
  Panel,
  Button,
  Working,
  SkeletonBlock,
  ErrorNote,
  SectionTitle,
} from "@/components/ResumeUi";

// Tailor screen: paste the ad, analyze, then work through the suggestions.
//
// Everything here is read-only with respect to the stored resume. Approvals
// accumulate in the parent's in-memory working copy and are only ever applied
// to a byte-copy of the .docx at export time.

export function ResumeTailor({
  jd,
  setJd,
  company,
  setCompany,
  analysis,
  setAnalysis,
  children,
}: {
  jd: string;
  setJd: (s: string) => void;
  company: string;
  setCompany: (s: string) => void;
  analysis: TailorAnalysis | null;
  setAnalysis: (a: TailorAnalysis | null) => void;
  // The review UI, supplied by the parent so this component stays about the
  // request and the parent owns the accept/reject state that Export reads.
  children?: React.ReactNode;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  // Once the user edits the company field we stop overwriting it, so a local
  // guess or the model's answer can never clobber what they typed.
  const touched = useRef(false);

  // Fill the company in as soon as there's enough text to guess from, rather
  // than making them wait out the analysis to see it.
  useEffect(() => {
    if (touched.current || jd.trim().length < 40) return;
    const guess = guessCompany(jd);
    if (guess) setCompany(guess);
  }, [jd, setCompany]);

  const analyze = useCallback(async () => {
    setAnalyzing(true);
    setError("");
    setAnalysis(null);
    try {
      const res = await fetchWithTimeout("/api/resume/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jd, company }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Analysis failed.");
        return;
      }
      const next = body.analysis as TailorAnalysis;
      setAnalysis(next);
      if (!touched.current && next.company) setCompany(next.company);
    } catch (err) {
      // Worth separating: a timeout means the paste is still here and Analyze
      // is worth pressing again, which "couldn't reach the server" does not
      // convey. The old wording was also never reachable when the machine
      // slept — the promise simply never settled.
      setError(
        err instanceof RequestTimeoutError
          ? "That took too long — the analysis didn't come back. Your job description is still here; press Analyze to try again."
          : "Couldn't reach the server.",
      );
    } finally {
      setAnalyzing(false);
    }
  }, [jd, company, setAnalysis, setCompany]);

  const tooShort = jd.trim().length < 80;

  return (
    <div className="space-y-4">
      <Panel>
        <SectionTitle hint="Paste the whole posting — requirements, responsibilities, the lot. It never leaves your account.">
          Job description
        </SectionTitle>

        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={10}
          placeholder="Paste the job description here…"
          className="w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2.5 text-xs leading-relaxed text-ink placeholder:text-ink-faint/60 focus:border-accent-bright focus:outline-none"
        />

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-ink-faint">
              Company — used for the export filename
            </span>
            <input
              type="text"
              value={company}
              placeholder="Auto-filled from the posting"
              onChange={(e) => {
                touched.current = true;
                setCompany(e.target.value);
              }}
              className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint/60 focus:border-accent-bright focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-2">
            <Button onClick={analyze} disabled={analyzing || tooShort}>
              {analyzing ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze"}
            </Button>
            {jd && (
              <Button
                variant="ghost"
                disabled={analyzing}
                onClick={() => {
                  setJd("");
                  setAnalysis(null);
                  setError("");
                  touched.current = false;
                  setCompany("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {tooShort && jd.trim().length > 0 && (
          <p className="mt-2 font-mono text-[10px] text-ink-faint">
            Keep going — that&apos;s too short to tailor against.
          </p>
        )}
      </Panel>

      {error && <ErrorNote>{error}</ErrorNote>}

      {analyzing && (
        <Panel className="space-y-4">
          <Working
            label="Comparing your resume to the posting"
            hint="Gemini is reading both and drafting targeted edits. This usually takes 10–20 seconds."
          />
          <SkeletonBlock lines={6} />
        </Panel>
      )}

      {analysis && !analyzing && (
        <>
          <Panel>
            <SectionTitle
              hint={
                analysis.company
                  ? `Tailored against ${analysis.company}`
                  : undefined
              }
            >
              Analysis
            </SectionTitle>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Keywords", analysis.jd_keywords.length],
                [
                  "Covered",
                  analysis.coverage.filter((c) => c.status === "present").length,
                ],
                ["Suggestions", analysis.bullet_suggestions.length],
                ["Gaps", analysis.honest_gaps.length],
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
          </Panel>

          {children}
        </>
      )}
    </div>
  );
}
