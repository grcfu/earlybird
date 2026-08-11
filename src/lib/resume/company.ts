// Guessing the hiring company from a pasted job ad.
//
// This is a convenience, not the source of truth. Gemini extracts the company
// properly during analysis, and the user can always override the field. The
// point of doing it locally is that the field fills in the moment they paste,
// instead of twelve seconds later when the analysis lands.

// Legal suffixes, so "Kestrel Robotics, Inc." reads as "Kestrel Robotics".
const SUFFIX_RE =
  /[,\s]+(?:inc|inc\.|llc|l\.l\.c\.|ltd|ltd\.|limited|corp|corp\.|corporation|co|co\.|company|gmbh|plc|s\.a\.|pty|pte|ab|nv|bv)\.?$/i;

// Words that mean a capitalised phrase is a section heading, not a name.
const NOT_A_NAME =
  /^(about|overview|summary|responsibilities|requirements|qualifications|benefits|the role|role|position|job|description|who we are|what you|our team|location|salary|apply)/i;

function tidy(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  // Drop trailing punctuation and any wrapping brackets/quotes.
  s = s.replace(/^["'([]+/, "").replace(/["')\].,;:!?]+$/, "");
  s = s.replace(SUFFIX_RE, "").trim();
  return s;
}

function plausible(s: string): boolean {
  if (s.length < 2 || s.length > 60) return false;
  if (NOT_A_NAME.test(s)) return false;
  // Must contain a letter, and must not be a whole sentence.
  if (!/[A-Za-z]/.test(s)) return false;
  if (s.split(" ").length > 6) return false;
  return true;
}

/**
 * Best guess at the hiring company, or "" when nothing looks right.
 *
 * Ordered by how reliable the pattern is, most reliable first. Returning ""
 * beats returning a wrong name: an empty field reads as "type it in", a wrong
 * one gets saved into a filename without being noticed.
 */
export function guessCompany(jd: string): string {
  const text = jd.trim();
  if (!text) return "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const head = lines.slice(0, 8).join("\n");

  const patterns: RegExp[] = [
    // "Company: Kestrel Robotics"
    /^\s*company\s*[:\-—]\s*(.+)$/im,
    // "at Kestrel Robotics" / "join Kestrel Robotics"
    /\b(?:at|join|with)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3}(?:,?\s+(?:Inc|LLC|Ltd|Corp|Co)\.?)?)/,
    // "Kestrel Robotics is hiring/seeking/looking"
    /^([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\s+is\s+(?:hiring|seeking|looking|building)/im,
    // "About Kestrel Robotics"
    /^\s*about\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})\s*$/im,
  ];

  for (const re of patterns) {
    const m = head.match(re) ?? text.match(re);
    if (!m) continue;
    const s = tidy(m[1]);
    if (plausible(s)) return s;
  }

  // Fall back to the title line: job ads very often open with
  // "Role — Company" or "Company - Role". Prefer the side that carries a legal
  // suffix; otherwise take the trailing side, which is the commoner layout.
  const first = lines[0];
  if (first) {
    const parts = first.split(/\s+[—–|]\s+|\s+-\s+/).map(tidy);
    if (parts.length >= 2) {
      const withSuffix = first
        .split(/\s+[—–|]\s+|\s+-\s+/)
        .find((p) => SUFFIX_RE.test(p.trim()));
      const candidate = withSuffix ? tidy(withSuffix) : parts[parts.length - 1];
      if (plausible(candidate)) return candidate;
    }
  }

  return "";
}
