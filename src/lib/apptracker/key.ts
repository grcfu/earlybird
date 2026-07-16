// Per-user tracker key (client-side). It's a bearer secret: whoever holds it
// can read/write that user's applications. Stored in the browser and pasted
// into the Gmail Apps Script, mirroring the feed's private-per-browser model.

const KEY_STORAGE = "earlybird:trackerKey";

export function getTrackerKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setTrackerKey(key: string): void {
  try {
    localStorage.setItem(KEY_STORAGE, key);
  } catch {
    /* ignore quota/availability errors */
  }
}

// A fresh random key (~51 chars). crypto.getRandomValues is available in the
// browser, where this runs.
export function generateTrackerKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `eb_${hex}`;
}
