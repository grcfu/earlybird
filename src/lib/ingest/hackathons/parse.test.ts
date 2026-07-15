import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDevpostDates,
  parseFormat,
  cleanPrize,
} from "@/lib/ingest/hackathons/parse";
import { HackathonFormat } from "@/generated/prisma/client";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

test("parseDevpostDates: cross-month, single trailing year", () => {
  const { startsAt, endsAt } = parseDevpostDates("May 19 - Aug 17, 2026");
  assert.equal(iso(startsAt), "2026-05-19");
  assert.equal(iso(endsAt), "2026-08-17");
});

test("parseDevpostDates: same month, day-only end", () => {
  const { startsAt, endsAt } = parseDevpostDates("Jul 10 - 16, 2026");
  assert.equal(iso(startsAt), "2026-07-10");
  assert.equal(iso(endsAt), "2026-07-16");
});

test("parseDevpostDates: cross-year with a year on each side", () => {
  const { startsAt, endsAt } = parseDevpostDates("Dec 1, 2025 - Feb 28, 2026");
  assert.equal(iso(startsAt), "2025-12-01");
  assert.equal(iso(endsAt), "2026-02-28");
});

test("parseDevpostDates: unparseable → nulls", () => {
  assert.deepEqual(parseDevpostDates("Coming soon"), {
    startsAt: null,
    endsAt: null,
  });
  assert.deepEqual(parseDevpostDates(null), { startsAt: null, endsAt: null });
});

test("parseFormat: maps both source vocabularies", () => {
  assert.equal(parseFormat("digital"), HackathonFormat.ONLINE);
  assert.equal(parseFormat("online"), HackathonFormat.ONLINE);
  assert.equal(parseFormat("hybrid_physical"), HackathonFormat.HYBRID);
  assert.equal(parseFormat("physical"), HackathonFormat.IN_PERSON);
  assert.equal(parseFormat(undefined), HackathonFormat.IN_PERSON);
});

test("cleanPrize: strips markup and drops empty/zero", () => {
  assert.equal(
    cleanPrize("$<span data-currency-value>2,000,000</span>"),
    "$2,000,000",
  );
  assert.equal(cleanPrize("$0"), null);
  assert.equal(cleanPrize(""), null);
  assert.equal(cleanPrize(null), null);
});
