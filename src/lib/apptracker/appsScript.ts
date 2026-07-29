// Builds the Google Apps Script the user pastes into script.google.com for each
// Gmail account. It scans a label, posts each message to the ingest endpoint,
// then moves the thread to a "done" label so it's processed once. The classifier
// lives server-side, so this script never needs to change.
//
// It also ships a `backfillApplications` entry point that replays already-retired
// threads through the endpoint — needed because ingest is only as good as the
// classifier was on the day the email arrived, and because an earlier version of
// this script retired threads even when the POST failed.

export function buildAppsScript(key: string, endpoint: string): string {
  return `// EarlyBird — auto-track job applications from Gmail.
// Setup:
//   1. Make a Gmail label "EarlyBird" and a filter that applies it to job
//      emails (e.g. from greenhouse-mail.io, myworkday, lever, ashby, or your
//      forwarded WUSTL mail). Existing emails: select them and apply the label.
//   2. Paste this whole file into script.google.com (new project) and Save.
//   3. Run trackApplications once (authorize when prompted).
//   4. Triggers (clock icon) → Add Trigger → trackApplications, time-driven,
//      every 15 minutes.
// Run this in EACH Gmail account you want tracked (same key is fine).
//
// Re-processing old mail: run backfillApplications (see the bottom of this file)
// to replay everything already in EarlyBird-Done. Safe to run repeatedly —
// re-sending an email never duplicates it and never moves a stage backwards.

const ENDPOINT = ${JSON.stringify(endpoint)};
const KEY = ${JSON.stringify(key)};
const LABEL = "EarlyBird";
const DONE_LABEL = "EarlyBird-Done";
// Emails that reached EarlyBird but couldn't be read as an application event
// (no company or no stage recognized). They land here instead of vanishing, so
// you can see exactly what didn't get tracked.
const SKIPPED_LABEL = "EarlyBird-Unmatched";
// Threads per run. Apps Script caps execution at ~6 minutes and each message
// costs one HTTP round-trip, so we stay well inside that.
const BATCH = 50;
// Where the last backfill run stopped, so repeated runs walk forward instead of
// redoing the first page forever.
const CURSOR_PROP = "earlybirdBackfillCursor";

function labelOrCreate(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

// Post every message in a thread. Returns "ok" (all landed, at least one
// tracked), "skipped" (all landed, nothing classifiable) or "failed" (couldn't
// reach the server — caller should leave the thread queued for a retry).
function postThread(thread) {
  const messages = thread.getMessages();
  var failed = false;
  var tracked = false;
  for (var m = 0; m < messages.length; m++) {
    const msg = messages[m];
    const payload = {
      key: KEY,
      subject: msg.getSubject(),
      body: msg.getPlainBody(),
      from: msg.getFrom(),
      receivedAt: msg.getDate().toISOString(),
    };
    try {
      const res = UrlFetchApp.fetch(ENDPOINT, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code < 200 || code >= 300) {
        failed = true;
        Logger.log("HTTP " + code + " for: " + msg.getSubject());
        continue;
      }
      const data = JSON.parse(res.getContentText());
      const result = data && data.result;
      if (result && result.status === "skipped") {
        // The subject plus the reason is usually enough to spot the pattern the
        // classifier is missing.
        Logger.log("SKIPPED (" + result.reason + "): " + msg.getSubject());
      } else if (result) {
        tracked = true;
        Logger.log(
          result.status + " " + result.company + " -> " + result.stage,
        );
      }
    } catch (e) {
      failed = true;
      Logger.log(e);
    }
  }
  if (failed) return "failed";
  return tracked ? "ok" : "skipped";
}

// --- Normal run: drain the EarlyBird label -----------------------------------

function trackApplications() {
  const label = GmailApp.getUserLabelByName(LABEL);
  if (!label) {
    Logger.log("Create a Gmail label named '" + LABEL + "' first.");
    return;
  }
  const done = labelOrCreate(DONE_LABEL);
  const unmatched = labelOrCreate(SKIPPED_LABEL);

  const threads = label.getThreads(0, BATCH);
  var counts = { ok: 0, skipped: 0, failed: 0 };
  for (var t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const outcome = postThread(thread);
    counts[outcome]++;
    // Only retire the thread once every message actually landed — otherwise a
    // transient outage would drop those emails permanently.
    if (outcome === "failed") continue;
    thread.removeLabel(label);
    thread.addLabel(outcome === "skipped" ? unmatched : done);
  }
  Logger.log(
    "trackApplications: " + counts.ok + " tracked, " + counts.skipped +
      " unmatched, " + counts.failed + " failed (will retry)",
  );
}

// --- Backfill: replay EarlyBird-Done through the current classifier -----------
// Run this by hand from the editor (pick backfillApplications in the function
// dropdown → Run), then check the execution log. Anything the classifier still
// can't read gets the EarlyBird-Unmatched label so you can find it in Gmail.
//
// Idempotent: the server dedupes each message and only ever advances a stage, so
// replaying an email that was already tracked changes nothing. Run it until the
// log says the cursor reached the end.

function backfillApplications() {
  const done = GmailApp.getUserLabelByName(DONE_LABEL);
  if (!done) {
    Logger.log("No '" + DONE_LABEL + "' label — nothing to backfill.");
    return;
  }
  const unmatched = labelOrCreate(SKIPPED_LABEL);
  const props = PropertiesService.getScriptProperties();
  var start = parseInt(props.getProperty(CURSOR_PROP) || "0", 10);
  if (isNaN(start) || start < 0) start = 0;

  const threads = done.getThreads(start, BATCH);
  if (threads.length === 0) {
    Logger.log(
      "Backfill complete — replayed everything in " + DONE_LABEL +
        ". Run resetBackfill() to start over.",
    );
    return;
  }

  var counts = { ok: 0, skipped: 0, failed: 0 };
  for (var t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const outcome = postThread(thread);
    counts[outcome]++;
    // Surface the still-unreadable ones without pulling them out of Done, so
    // the cursor's view of the label stays stable while we page through it.
    if (outcome === "skipped") thread.addLabel(unmatched);
  }
  props.setProperty(CURSOR_PROP, String(start + threads.length));
  Logger.log(
    "Backfill " + start + "-" + (start + threads.length) + ": " + counts.ok +
      " tracked, " + counts.skipped + " unmatched, " + counts.failed +
      " failed. Run again to continue.",
  );
}

function resetBackfill() {
  PropertiesService.getScriptProperties().deleteProperty(CURSOR_PROP);
  Logger.log("Backfill cursor reset — the next run starts from the beginning.");
}
`;
}
