import { test } from "node:test";
import assert from "node:assert/strict";
import { guessCompany } from "@/lib/resume/company";

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
