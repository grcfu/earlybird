import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesPreference, type MatchListing } from "@/lib/notify/matcher";

const base: MatchListing = {
  category: "SWE",
  title: "Backend Software Engineer Intern",
  locations: ["New York, NY", "Remote"],
  active: true,
};

const allPref = {
  categories: [],
  keywords: [],
  locationsFilter: [],
  activeOnly: false,
};

test("empty preference matches everything", () => {
  assert.equal(matchesPreference(base, allPref), true);
});

test("category filter", () => {
  assert.equal(matchesPreference(base, { ...allPref, categories: ["SWE"] }), true);
  assert.equal(
    matchesPreference(base, { ...allPref, categories: ["ML_AI", "QUANT"] }),
    false,
  );
});

test("keyword filter is case-insensitive, any-match", () => {
  assert.equal(matchesPreference(base, { ...allPref, keywords: ["backend"] }), true);
  assert.equal(
    matchesPreference(base, { ...allPref, keywords: ["frontend", "BACKEND"] }),
    true,
  );
  assert.equal(matchesPreference(base, { ...allPref, keywords: ["mobile"] }), false);
});

test("location filter matches substrings, any-match", () => {
  assert.equal(
    matchesPreference(base, { ...allPref, locationsFilter: ["new york"] }),
    true,
  );
  assert.equal(
    matchesPreference(base, { ...allPref, locationsFilter: ["remote"] }),
    true,
  );
  assert.equal(
    matchesPreference(base, { ...allPref, locationsFilter: ["chicago"] }),
    false,
  );
});

test("activeOnly excludes inactive roles", () => {
  const inactive = { ...base, active: false };
  assert.equal(matchesPreference(inactive, { ...allPref, activeOnly: true }), false);
  assert.equal(matchesPreference(inactive, { ...allPref, activeOnly: false }), true);
});

test("combined filters must all pass", () => {
  const pref = {
    categories: ["SWE"],
    keywords: ["software"],
    locationsFilter: ["ny"],
    activeOnly: true,
  };
  assert.equal(matchesPreference(base, pref), true);
  assert.equal(matchesPreference({ ...base, category: "DATA" }, pref), false);
});
