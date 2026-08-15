// A fetch for the Gemini-backed routes that cannot hang forever.
//
// The failure this exists for, observed rather than imagined: the machine
// sleeps mid-analysis. The socket dies without the promise ever settling, so
// the `finally` that clears the spinner never runs, and the tab goes on
// claiming to be working for the rest of its life. Waiting does not help —
// there is nothing left to wait for — and the caller's `catch` never fires, so
// the error it was written to show is unreachable. Only a reload clears it.
//
// The ceiling is not a guess. Each of these routes bounds itself already:
// gemini.ts gives up at 55s and the routes declare maxDuration = 60, so a
// server that is still alive has answered — or failed — well before this. Past
// that point the response is not late, it is never coming, and saying so beats
// a spinner that outlives the request.
const SERVER_CEILING_MS = 60_000;
export const REQUEST_TIMEOUT_MS = SERVER_CEILING_MS + 15_000;

// Distinguishable from a network failure so the caller can say which happened:
// "took too long" and "couldn't reach the server" send the user to different
// places, and a timeout on a request the server may still be processing is
// worth wording carefully.
export class RequestTimeoutError extends Error {
  constructor(ms: number) {
    super(`Request exceeded ${ms}ms`);
    this.name = "RequestTimeoutError";
  }
}

/**
 * fetch, with an upper bound on how long it may stay unsettled.
 *
 * Rejects with RequestTimeoutError once the bound passes, and aborts the
 * underlying request so a resumed machine isn't holding a socket open for a
 * reply nobody is waiting for any more.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  // The abort reason has to be tracked separately: an AbortError raised by our
  // own timer and one raised by a caller-supplied signal are the same exception
  // type, and only the first should be reported to the user as a timeout.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new RequestTimeoutError(timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
