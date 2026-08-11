import { test } from "node:test";
import assert from "node:assert/strict";
import { quotaMessage, DAILY_LIMIT } from "@/lib/resume/quota";

test("the limit is a sane default, overridable by env", () => {
  assert.ok(Number.isFinite(DAILY_LIMIT) && DAILY_LIMIT > 0, String(DAILY_LIMIT));
});

test("the message says when it resets and why the limit exists", () => {
  // A bare "limit reached" reads as a bug. The user should know it clears, and
  // that it exists because the API key is shared rather than theirs.
  const msg = quotaMessage({ allowed: false, used: 41, limit: 40 });
  assert.match(msg, /40/);
  assert.match(msg, /midnight UTC/);
  assert.match(msg, /shared API key/);
});
