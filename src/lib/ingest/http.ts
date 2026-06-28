// Small fetch helpers shared by the provider (multi-endpoint) sources.

const DEFAULT_HEADERS = {
  "User-Agent": "earlybird-ingest (+https://github.com/grcfu/earlybird)",
  Accept: "application/json",
};

// Fetch + parse JSON with a timeout. Throws on non-2xx or parse failure so the
// caller (per-company in a provider) can isolate the error.
export async function fetchJson(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<unknown> {
  const { timeoutMs = 20_000, headers, ...rest } = init ?? {};
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...rest,
      headers: { ...DEFAULT_HEADERS, ...headers },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
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
