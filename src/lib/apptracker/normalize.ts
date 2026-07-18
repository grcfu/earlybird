// Canonical company key for de-duplication. Two emails about the same
// application often word the company differently ("Akuna Capital" vs "Akuna
// Capital Recruitment" vs "the Akuna Capital team"), so we match on this
// normalized form instead of the raw string.
//
// Deliberately conservative: it strips only recruiting/HR/legal boilerplate and
// a leading "the", never distinctive words — so genuinely different companies
// (e.g. "Meta" vs "Meta Platforms") stay separate.

const TRAILING =
  /\s+(recruitment|recruiting|recruiter|recruiters|talent acquisition|talent|careers|career|hiring team|hiring|team|hr|human resources|campus|university recruiting|people team|people|inc|inc\.|llc|l\.l\.c|ltd|limited|corp|corporation|gmbh|plc|co)$/;

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
