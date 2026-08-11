import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeHeaderValue, asciiFilename } from "@/lib/resume/http-headers";

// Regression: export returned HTTP 500 the first time the font lever ran. The
// note read "body text 11pt → 10.5pt" and U+2192 is 8594 — header values are
// ByteStrings, so anything above 255 throws when the Response is constructed.

// Node's own answer to "may this go in a header?".
function headerSafe(v: string): boolean {
  try {
    new Headers({ "x-test": v });
    return true;
  } catch {
    return false;
  }
}

test("the arrow that actually broke export is unsafe raw, safe encoded", () => {
  const note = "body text 11pt → 10.5pt (headings unchanged)";
  assert.equal(headerSafe(note), false, "precondition: the raw note must be unsafe");
  assert.equal(headerSafe(encodeHeaderValue(note)), true);
  assert.equal(decodeURIComponent(encodeHeaderValue(note)), note);
});

test("an em dash in a note is handled too", () => {
  const note = "1 new bullet(s) skipped — no experience bullet to attach them to";
  assert.equal(headerSafe(note), false);
  assert.equal(headerSafe(encodeHeaderValue(note)), true);
  assert.equal(decodeURIComponent(encodeHeaderValue(note)), note);
});

test("several notes survive the round trip joined together", () => {
  const notes = ["2 bullet(s) removed to fit one page", "body text 11pt → 10.5pt"];
  assert.deepEqual(
    decodeURIComponent(encodeHeaderValue(notes.join("; "))).split("; "),
    notes,
  );
});

test("a filename outside latin-1 does not break the header", () => {
  for (const name of ["Nakamura_Resume_中村.docx", "Nestlé_Resume_Café.docx"]) {
    assert.equal(headerSafe(asciiFilename(name)), true, name);
  }
});

test("typographic dashes and quotes are folded, not deleted", () => {
  assert.equal(asciiFilename("Lovelace–Resume.docx"), "Lovelace-Resume.docx");
  assert.equal(asciiFilename("O’Brien_Resume.docx"), "O'Brien_Resume.docx");
});

test("an ordinary filename passes through untouched", () => {
  assert.equal(
    asciiFilename("Lovelace_Resume_Kestrel Robotics.docx"),
    "Lovelace_Resume_Kestrel Robotics.docx",
  );
});

test("a name that folds away to nothing falls back to something usable", () => {
  // Stripping "中村" would otherwise leave a bare ".docx".
  assert.equal(asciiFilename("中村.docx"), "Resume.docx");
  assert.equal(asciiFilename(""), "Resume.docx");
  assert.equal(asciiFilename("   "), "Resume.docx");
});
