// Word-level diff for the bullet review toggle.
//
// The user flips one bullet between what it says now and what Gemini proposes,
// and needs to see at a glance which words actually changed. Highlighting the
// whole revised line tells them nothing; highlighting the changed words tells
// them everything.
//
// Bracketed spans get their own kind. The analyze prompt requires Gemini to
// wrap anything it invented — "[X]%", "[Kubernetes]" — and those are the words
// the user MUST notice, because shipping one unedited puts a literal "[X]" in
// front of a recruiter. They are called out separately from ordinary additions
// rather than being folded in with them.

export type SegmentKind = "same" | "added" | "placeholder";

export interface Segment {
  text: string;
  kind: SegmentKind;
}

// Split into words and the whitespace between them, keeping both, so the
// segments reassemble into the original string exactly.
export function tokenize(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t !== "");
}

/**
 * Longest common subsequence over tokens, as an index per token of `b`: the
 * index of the token in `a` it was matched to, or null when it is new.
 *
 * Two callers need this. The toggle needs to know WHICH words are new; the
 * .docx rewriter needs to know which original word each new word corresponds
 * to, so it can put the new text back into the run that carried the old.
 *
 * Bullets are a line long, so the O(n*m) table is a few thousand cells at
 * worst. Guarded anyway — a pathological input shouldn't hang the tab.
 */
export function alignTokens(a: string[], b: string[]): (number | null)[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return new Array(m).fill(null);
  if (n * m > 1_000_000) {
    // Far past any real bullet. Fall back to "everything is new", which is
    // honest: we can't say what changed, so we don't claim to.
    return new Array(m).fill(null);
  }

  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: Uint32Array[] = Array.from(
    { length: n + 1 },
    () => new Uint32Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const align = new Array<number | null>(m).fill(null);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      align[j] = i;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return align;
}

// Break a run of text on bracketed placeholders, tagging those spans.
function splitPlaceholders(text: string, kind: SegmentKind): Segment[] {
  if (!text.includes("[")) return [{ text, kind }];
  const out: Segment[] = [];
  // Non-greedy and non-nesting: "[a [X]% b]" yields "[a [X]" then the rest,
  // which still puts a marker where the invented value is.
  for (const part of text.split(/(\[[^[\]]*\])/)) {
    if (part === "") continue;
    out.push({
      text: part,
      kind: /^\[[^[\]]*\]$/.test(part) ? "placeholder" : kind,
    });
  }
  return out;
}

/**
 * Segments of `revised`, marking which words are new relative to `original`.
 *
 * Only the revised side is returned: the toggle shows one line at a time, so
 * there is nothing to render for deletions.
 */
export function diffSegments(original: string, revised: string): Segment[] {
  const a = tokenize(original);
  const b = tokenize(revised);
  const align = alignTokens(a, b);

  // Merge neighbouring tokens of the same kind so the DOM gets a handful of
  // spans instead of one per word.
  const merged: Segment[] = [];
  for (let j = 0; j < b.length; j++) {
    const kind: SegmentKind = align[j] !== null ? "same" : "added";
    const last = merged[merged.length - 1];
    if (last && last.kind === kind) last.text += b[j];
    else merged.push({ text: b[j], kind });
  }

  // Whitespace-only runs marked "added" are visual noise — a highlighted gap
  // between two unchanged words. Treat them as unchanged.
  for (const seg of merged) {
    if (seg.kind === "added" && seg.text.trim() === "") seg.kind = "same";
  }

  return merged.flatMap((seg) => splitPlaceholders(seg.text, seg.kind));
}

// Every bracketed placeholder in a string, deduped, in order of appearance.
// Used to warn before export that a bullet still carries a fill-me-in.
export function placeholdersIn(text: string): string[] {
  const found = text.match(/\[[^[\]]*\]/g) ?? [];
  return [...new Set(found)];
}
