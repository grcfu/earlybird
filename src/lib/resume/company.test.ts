import { test } from "node:test";
import assert from "node:assert/strict";
import {
  guessCompany,
  sanitizeCompany,
  lastNameOf,
  exportFilename,
} from "@/lib/resume/company";

test("an explicit Company: line wins", () => {
  assert.equal(guessCompany("Company: Kestrel Robotics\nBackend intern"), "Kestrel Robotics");
});

test("legal suffixes are dropped", () => {
  assert.equal(guessCompany("Company: Kestrel Robotics, Inc."), "Kestrel Robotics");
  assert.equal(guessCompany("Company: Acme LLC"), "Acme");
  assert.equal(guessCompany("Company: Globex Corporation"), "Globex");
});

test("'at <Company>' is picked up from prose", () => {
  assert.equal(
    guessCompany("We're looking for a backend intern at Kestrel Robotics to join us."),
    "Kestrel Robotics",
  );
});

test("'<Company> is hiring' is picked up", () => {
  assert.equal(
    guessCompany("Kestrel Robotics is hiring a backend infrastructure intern."),
    "Kestrel Robotics",
  );
});

test("a title line splits on a dash and takes the company side", () => {
  assert.equal(
    guessCompany("Backend Infrastructure Intern — Kestrel Robotics, Inc.\n\nAbout the role:"),
    "Kestrel Robotics",
  );
});

test("section headings are never mistaken for a company", () => {
  // "About the role" and friends would otherwise sail through the About pattern.
  assert.equal(guessCompany("About the role\nYou will build things."), "");
  assert.equal(guessCompany("Requirements\n3+ years of Rust"), "");
});

test("a whole sentence is rejected rather than guessed at", () => {
  const jd = "We are looking for someone who has shipped production workloads.";
  const guess = guessCompany(jd);
  assert.ok(guess === "" || guess.split(" ").length <= 6, `runaway guess: ${guess}`);
});

test("empty and whitespace input give an empty string, not a crash", () => {
  assert.equal(guessCompany(""), "");
  assert.equal(guessCompany("   \n  \n"), "");
});

test("no plausible name gives an empty string", () => {
  // An empty field reads as "type it in". A wrong one gets saved into a
  // filename without anyone noticing.
  assert.equal(guessCompany("responsibilities include writing code and tests"), "");
});

test("the real-world ad used to verify the analyze route", () => {
  const jd = `Backend Infrastructure Intern — Kestrel Robotics, Inc.

About the role: You will work on our distributed control plane.`;
  assert.equal(guessCompany(jd), "Kestrel Robotics");
});

// --- Export filename ---------------------------------------------------------

test("sanitizeCompany drops legal suffixes", () => {
  assert.equal(sanitizeCompany("Kestrel Robotics, Inc."), "Kestrel Robotics");
  assert.equal(sanitizeCompany("Acme LLC"), "Acme");
});

test("sanitizeCompany strips punctuation and collapses spaces", () => {
  assert.equal(sanitizeCompany("Ben & Jerry's"), "Ben Jerry s");
  assert.equal(sanitizeCompany("Yahoo!"), "Yahoo");
  assert.equal(sanitizeCompany("  Spaced    Out  "), "Spaced Out");
});

test("sanitizeCompany removes characters that are illegal in a filename", () => {
  // A slash would silently create a directory path, or fail the download.
  assert.equal(sanitizeCompany("A/B Testing Co."), "A B Testing");
  assert.equal(sanitizeCompany('Weird:*?"<>|Name'), "Weird Name");
});

test("lastNameOf takes the surname", () => {
  assert.equal(lastNameOf("Ada Lovelace"), "Lovelace");
  assert.equal(lastNameOf("Ada King Lovelace"), "Lovelace");
});

test("lastNameOf title-cases a shouted name but leaves deliberate casing alone", () => {
  assert.equal(lastNameOf("ADA LOVELACE"), "Lovelace");
  assert.equal(lastNameOf("Ronald McDonald"), "McDonald");
});

test("lastNameOf ignores credential and generational suffixes", () => {
  assert.equal(lastNameOf("Ada Lovelace, PhD"), "Lovelace");
  assert.equal(lastNameOf("John Smith Jr."), "Smith");
  assert.equal(lastNameOf("Henry Ford III"), "Ford");
});

test("lastNameOf copes with one word and with nothing", () => {
  assert.equal(lastNameOf("Prince"), "Prince");
  assert.equal(lastNameOf(""), "");
  assert.equal(lastNameOf("   "), "");
});

test("exportFilename builds LastName_Resume_Company.docx", () => {
  assert.equal(
    exportFilename("Ada Lovelace", "Kestrel Robotics, Inc."),
    "Lovelace_Resume_Kestrel Robotics.docx",
  );
});

test("exportFilename degrades rather than failing", () => {
  // A missing piece should never block a download the user already earned.
  assert.equal(exportFilename("Ada Lovelace", ""), "Lovelace_Resume.docx");
  assert.equal(exportFilename("", "Acme Inc"), "Resume_Acme.docx");
  assert.equal(exportFilename("", ""), "Resume.docx");
});
