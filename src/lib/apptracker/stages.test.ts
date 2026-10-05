import { test } from "node:test";
import assert from "node:assert/strict";
import { stageFromTimeline, stageDates, type StageEvent } from "./stages";

const ev = (stage: StageEvent["stage"], date: string): StageEvent => ({ stage, date });

test("stageFromTimeline: empty timeline has no stage", () => {
  assert.equal(stageFromTimeline([]), null);
});

test("stageFromTimeline: furthest stage wins regardless of order", () => {
  const got = stageFromTimeline([
    ev("INTERVIEW", "2026-09-20"),
    ev("APPLIED", "2026-09-12"),
    ev("ASSESSMENT", "2026-09-13"),
  ]);
  assert.deepEqual(got, ev("INTERVIEW", "2026-09-20"));
});

test("stageFromTimeline: an added stage earlier in time still advances", () => {
  // The OA email was missed; adding it after the fact moves Applied → Assessment.
  const got = stageFromTimeline([ev("APPLIED", "2026-09-12"), ev("ASSESSMENT", "2026-09-13")]);
  assert.equal(got?.stage, "ASSESSMENT");
});

test("stageFromTimeline: offer and rejected tie on rank, later date wins", () => {
  assert.equal(
    stageFromTimeline([ev("REJECTED", "2026-10-01"), ev("OFFER", "2026-10-03")])?.stage,
    "OFFER",
  );
  assert.equal(
    stageFromTimeline([ev("OFFER", "2026-10-03"), ev("REJECTED", "2026-10-05")])?.stage,
    "REJECTED",
  );
});

test("stageFromTimeline: deleting the top event falls back to the next", () => {
  const all = [ev("APPLIED", "2026-09-12"), ev("INTERVIEW", "2026-09-20")];
  assert.equal(stageFromTimeline(all.slice(0, 1))?.stage, "APPLIED");
});

test("stageDates: earliest date per stage", () => {
  const got = stageDates("INTERVIEW", [
    ev("INTERVIEW", "2026-09-22"),
    ev("ASSESSMENT", "2026-09-13"),
    ev("INTERVIEW", "2026-09-20"),
  ]);
  assert.deepEqual(got, { ASSESSMENT: "2026-09-13", INTERVIEW: "2026-09-20" });
});

test("stageDates: a stage corrected downwards drops the stale higher event", () => {
  const got = stageDates("APPLIED", [ev("APPLIED", "2026-09-12"), ev("INTERVIEW", "2026-09-20")]);
  assert.deepEqual(got, { APPLIED: "2026-09-12" });
});

test("stageDates: a rejection keeps the stages that led up to it", () => {
  const got = stageDates("REJECTED", [
    ev("ASSESSMENT", "2026-09-13"),
    ev("INTERVIEW", "2026-09-20"),
    ev("REJECTED", "2026-10-01"),
  ]);
  assert.equal(got.INTERVIEW, "2026-09-20");
  assert.equal(got.REJECTED, "2026-10-01");
});
