// Small fetch helpers shared by the provider (multi-endpoint) sources.

const DEFAULT_HEADERS = {
  "User-Agent": "earlybird-ingest (+https://github.com/grcfu/earlybird)",
  Accept: "application/json",
};

// Statuses that mean "come back later" rather than "this is broken". Retried;
// everything else (404 for a dead board, 500 for a tenant with a broken search)
// throws on the first try, because retrying it only wastes the run's time.
const RETRY_STATUS = new Set([429, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// How long to wait before attempt n+1. Honors Retry-After when the server sends
// a sane one, else exponential backoff. The jitter matters: without it a pool of
// workers that all get throttled at once retries in lockstep and re-triggers the
// same limit.
function backoffMs(attempt: number, retryAfter: string | null): number {
  const secs = Number(retryAfter);
  if (Number.isFinite(secs) && secs > 0 && secs <= 30) return secs * 1000;
  return Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 500);
}

// Fetch + parse JSON with a timeout. Throws on non-2xx or parse failure so the
// caller (per-company in a provider) can isolate the error.
//
// Retries throttling responses (see RETRY_STATUS). Workday forced this: its
// tenants are separate hosts but share a rate limit, so a wide fan-out gets
// 429s that have nothing to do with the board being reachable — at concurrency
// 24 across 1424 boards, a third of them failed this way and dropped out of the
// run entirely.
export async function fetchJson(
  url: string,
  init?: RequestInit & { timeoutMs?: number; retries?: number },
): Promise<unknown> {
  const { timeoutMs = 20_000, retries = 2, headers, ...rest } = init ?? {};

  for (let attempt = 0; ; attempt++) {
    // Set when the response says "throttled" and another attempt is allowed;
    // the wait happens after the timeout is cleared, not inside the try.
    let waitMs: number | null = null;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...rest,
        headers: { ...DEFAULT_HEADERS, ...headers },
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (res.ok) return await res.json();
      if (attempt >= retries || !RETRY_STATUS.has(res.status)) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      waitMs = backoffMs(attempt, res.headers.get("retry-after"));
    } finally {
      clearTimeout(t);
    }

    await sleep(waitMs);
  }
}

// Run `fn` over `items` with bounded concurrency, preserving input order. A
// rejected task becomes a rejected slot — callers decide how to handle it (the
// provider sources catch per-item so one bad company can't sink the source).
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}
