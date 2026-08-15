import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWithTimeout, RequestTimeoutError, REQUEST_TIMEOUT_MS } from "@/lib/resume/fetch";

const realFetch = globalThis.fetch;
function stubFetch(impl: typeof globalThis.fetch) {
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = realFetch;
  };
}

test("the ceiling sits above the server's own 60s bound", () => {
  // Below it and we would abort requests the server was still allowed to be
  // answering, turning a slow-but-fine analysis into a false failure.
  assert.ok(REQUEST_TIMEOUT_MS > 60_000, String(REQUEST_TIMEOUT_MS));
});

test("a response that arrives in time is passed straight through", async () => {
  const restore = stubFetch(async () => new Response("ok", { status: 200 }));
  try {
    const res = await fetchWithTimeout("/api/resume/analyze", {}, 1000);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
  } finally {
    restore();
  }
});

test("a request that never settles rejects as a timeout rather than hanging", async () => {
  // The sleeping-laptop case: the promise never settles on its own.
  const restore = stubFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );
  try {
    await assert.rejects(
      () => fetchWithTimeout("/api/resume/analyze", {}, 20),
      (err: unknown) => err instanceof RequestTimeoutError,
    );
  } finally {
    restore();
  }
});

test("the request is actually aborted, not just abandoned", async () => {
  let aborted = false;
  const restore = stubFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new Error("aborted"));
        });
      }),
  );
  try {
    await fetchWithTimeout("/api/resume/analyze", {}, 20).catch(() => {});
    assert.equal(aborted, true);
  } finally {
    restore();
  }
});

test("a genuine network failure stays a network failure", async () => {
  // It must not be relabelled as a timeout — the two need different wording.
  const restore = stubFetch(async () => {
    throw new TypeError("Failed to fetch");
  });
  try {
    await assert.rejects(
      () => fetchWithTimeout("/api/resume/analyze", {}, 1000),
      (err: unknown) => err instanceof TypeError && !(err instanceof RequestTimeoutError),
    );
  } finally {
    restore();
  }
});
