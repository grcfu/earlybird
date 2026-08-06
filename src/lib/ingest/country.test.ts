import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countryFromLocation,
  inferCountry,
  normalizeCountryCode,
  resolveCountry,
} from "@/lib/ingest/country";

test("normalizeCountryCode: accepts every form the ATSes report", () => {
  assert.equal(normalizeCountryCode("us"), "US"); // SmartRecruiters
  assert.equal(normalizeCountryCode("United States"), "US"); // Ashby
  assert.equal(normalizeCountryCode("GB"), "GB"); // Lever
  assert.equal(normalizeCountryCode("Deutschland"), "DE");
  assert.equal(normalizeCountryCode(""), null);
  assert.equal(normalizeCountryCode(null), null);
  assert.equal(normalizeCountryCode(42), null);
});

test("countryFromLocation: the spellings the old denylist missed", () => {
  // Each of these was showing up in a US-only feed.
  assert.equal(countryFromLocation("München"), "DE");
  assert.equal(countryFromLocation("Sant Cugat del Vallès"), "ES");
  assert.equal(countryFromLocation("Eindhoven"), "NL");
  assert.equal(countryFromLocation("PRC, Chengdu"), "CN");
});

test("countryFromLocation: diacritics don't matter", () => {
  assert.equal(countryFromLocation("Zürich"), "CH");
  assert.equal(countryFromLocation("Malmö"), "SE");
  assert.equal(countryFromLocation("São Paulo"), "BR");
  assert.equal(countryFromLocation("Kraków"), "PL");
});

test("countryFromLocation: US formats the boards actually use", () => {
  assert.equal(countryFromLocation("San Diego, CA, USA"), "US");
  assert.equal(countryFromLocation("US, CA, Santa Clara"), "US");
  assert.equal(countryFromLocation("Austin, TX"), "US");
  assert.equal(countryFromLocation("Bellevue, Washington"), "US");
  assert.equal(countryFromLocation("NYC - 1211 Ave of the Americas"), "US");
  assert.equal(countryFromLocation("GA Atlanta 1050 Techwood Drive NW"), "US");
});

test("countryFromLocation: an explicit country beats a city that looks like one", () => {
  // Paris, Texas is not France; London, UK is not London, Ontario.
  assert.equal(countryFromLocation("Paris, TX"), "US");
  assert.equal(countryFromLocation("London, UK"), "GB");
  assert.equal(countryFromLocation("GB-London"), "GB");
  // Ontario, California — the reason the old list refused to list "Ontario".
  assert.equal(countryFromLocation("Ontario, CA"), "US");
  assert.equal(countryFromLocation("Toronto, ON"), "CA");
});

test("countryFromLocation: US towns named after foreign cities stay US", () => {
  // The expensive failure mode: hiding a real US role. A state code is checked
  // before the city tables, so all of these resolve US despite the namesake.
  for (const loc of [
    "Vancouver, WA", "Manchester, NH", "Birmingham, AL", "Naples, FL",
    "Athens, GA", "Berlin, NH", "Florence, SC", "Lima, OH", "Toledo, OH",
    "Portland, OR", "Columbus, OH",
  ]) {
    assert.equal(countryFromLocation(loc), "US", loc);
  }
});

test("countryFromLocation: longest city name wins", () => {
  assert.equal(countryFromLocation("Sant Cugat del Vallès, Barcelona"), "ES");
  assert.equal(countryFromLocation("Ho Chi Minh City"), "VN");
});

test("countryFromLocation: strings with no comma to split on", () => {
  // Real location strings that used to resolve to nothing.
  assert.equal(countryFromLocation("Remote in USA"), "US");
  assert.equal(countryFromLocation("US SC Anderson"), "US");
  assert.equal(countryFromLocation("US Headquarters"), "US");
  assert.equal(countryFromLocation("NY New York 30 Hudson Yards"), "US");
  assert.equal(countryFromLocation("Singapore-CapitaSky"), "SG");
  assert.equal(countryFromLocation("SINGAPORE GENERAL OFFICE"), "SG");
});

test("countryFromLocation: a foreign name beats a US name used as a street", () => {
  // The loose US checks run last precisely so this doesn't read as Washington.
  assert.equal(countryFromLocation("Washington Street, London"), "GB");
  // And "in" inside a sentence must not be read as India (IN).
  assert.equal(countryFromLocation("Remote in USA"), "US");
});

test("countryFromLocation: unknown is null, not a guess", () => {
  assert.equal(countryFromLocation("5 Locations"), null);
  assert.equal(countryFromLocation("In-Office"), null);
  assert.equal(countryFromLocation(""), null);
  assert.equal(countryFromLocation("Stamford Hub"), "US"); // Stamford is listed
});

test("inferCountry: any US location makes the whole role US", () => {
  // A role open in both places is one you can take in the US.
  assert.equal(inferCountry(["München", "Austin, TX"]), "US");
  assert.equal(inferCountry(["London", "New York"]), "US");
  assert.equal(inferCountry(["London", "Paris"]), "GB");
  assert.equal(inferCountry([]), null);
  assert.equal(inferCountry(["2 Locations"]), null);
});

test("resolveCountry: what the ATS says beats what the string looks like", () => {
  // Lever reports GB for a posting whose location text says only "London".
  assert.equal(resolveCountry("GB", ["London"]), "GB");
  // Reported country wins even when the text would have said something else.
  assert.equal(resolveCountry("us", ["Ontario"]), "US");
  // Falls back to the text when the ATS reports nothing.
  assert.equal(resolveCountry(null, ["Eindhoven"]), "NL");
  assert.equal(resolveCountry(undefined, ["5 Locations"]), null);
});
