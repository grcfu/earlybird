// Canonical company key for de-duplication. Two emails about the same
// application often word the company differently ("Akuna Capital" vs "Akuna
// Capital Recruitment" vs "the Akuna Capital team"), so we match on this
// normalized form instead of the raw string.
//
// Deliberately conservative: it strips only recruiting/HR/legal boilerplate and
// a leading "the", never distinctive words — so genuinely different companies
// (e.g. "Meta" vs "Meta Platforms") stay separate.

// "ai" is in here because one email says "Scale AI" in the subject and "here at
// Scale" in the body — without stripping it, one application forks into two.
// Dropping it is safe: no pair of distinct employers is separated only by an "AI"
// suffix, and the display name keeps whichever form the email actually used.
// Multi-word labels come first so they peel as a unit: "Roblox Early Careers"
// must lose both words, not stop at "Roblox Early".
const TRAILING =
  /\s+(early careers|early career|early talent|university recruiting|university relations|campus recruiting|student programs|talent acquisition|recruitment|recruiting|recruiter|recruiters|talent|careers|career|hiring team|hiring|team|hr|human resources|campus|people team|people|notifications|notification|noreply|no-reply|ai|inc|inc\.|llc|l\.l\.c|ltd|limited|corp|corporation|gmbh|plc|co)$/i;

// Same boilerplate peel as normalizeCompany, but case- and spacing-preserving so
// the result is usable as a display name: "Microsoft Careers" → "Microsoft",
// "Deepgram Recruiting Team" → "Deepgram".
export function stripCompanyBoilerplate(raw: string): string {
  let s = raw.replace(/\s+/g, " ").trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(TRAILING, "").trim();
  } while (s !== prev && s.length > 0);
  return s;
}

// The initials of a multi-word company name: "Chicago Trading Company" → "ctc".
// Null when the name is one word (nothing to abbreviate) or long enough that the
// initials would be too generic to match on.
export function acronymOf(raw: string): string | null {
  const words = normalizeCompany(raw).split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 5) return null;
  return words.map((w) => w[0]).join("");
}

// Is this raw string already an acronym rather than a name? Used to prefer the
// spelled-out form for display once the two are known to be the same company.
export function looksLikeAcronym(raw: string): boolean {
  const s = raw.trim();
  return /^[A-Z]{2,5}$/.test(s.replace(/[.\s]/g, ""));
}

// Match key for "is this the same employer?" — the normalized name with word
// breaks removed. Where the words fall carries no signal: the same company
// arrives spelled "Capital One" in a recruiter's email and "Capitalone" from an
// ATS or a sending domain, and that split forks one application into two.
// Nothing distinctive is dropped, so unrelated companies still can't collide.
export function companyKey(raw: string): string {
  return normalizeCompany(raw).replace(/[\s-]/g, "");
}

// Do two company strings refer to the same employer? Same match key (normalized,
// spacing-insensitive), or one side is the other's initials — ATSes and their
// vendors mix the two freely ("Chicago Trading Company (CTC) invites you..."
// then "CTC: Your assessment"), which otherwise forks one application into two.
//
// Bounded on purpose: only 2–5 letter acronyms of 2–5 word names, so this can't
// quietly collapse unrelated companies the way a fuzzy match would.
export function sameCompany(a: string, b: string): boolean {
  const ka = normalizeCompany(a);
  const kb = normalizeCompany(b);
  if (!ka || !kb) return false;
  if (companyKey(a) === companyKey(b)) return true;
  if (/^[a-z]{2,5}$/.test(ka) && acronymOf(b) === ka) return true;
  if (/^[a-z]{2,5}$/.test(kb) && acronymOf(a) === kb) return true;
  return false;
}

export function normalizeCompany(raw: string): string {
  let s = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[.,'"’!&()/|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the\s+/, "");

  // Peel trailing boilerplate words repeatedly ("... talent team" → "...").
  let prev: string;
  do {
    prev = s;
    s = s.replace(TRAILING, "").trim();
  } while (s !== prev && s.length > 0);

  return s;
}
