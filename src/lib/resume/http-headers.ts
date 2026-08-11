// Making export's response headers safe to construct.
//
// HTTP header values are ByteStrings: a code point above 255 throws when the
// Response is built, which takes the whole download down with it. This is not
// hypothetical — the export returned a 500 the first time the font lever ran,
// because its note reads "body text 11pt → 10.5pt" and U+2192 is 8594. An em
// dash in another note had the same problem, and so would any surname or
// company name outside latin-1.

// Percent-encode a header value. The client decodes it. This sidesteps the
// whole class rather than playing whack-a-mole with individual characters.
export function encodeHeaderValue(s: string): string {
  return encodeURIComponent(s);
}

// The legacy `filename=` parameter of Content-Disposition has no encoding of
// its own, so it must be plain ASCII. `filename*` alongside it carries the real
// name; this is only the fallback, so folding is preferable to failing.
export function asciiFilename(s: string): string {
  const folded = s
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // A name that was entirely non-ASCII leaves nothing but an extension, which
  // is a worse download than an honest generic name.
  return /[A-Za-z0-9]/.test(folded.replace(/\.docx$/i, "")) ? folded : "Resume.docx";
}
