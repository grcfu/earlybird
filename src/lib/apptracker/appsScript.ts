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
// If you paste a NEWER version of this file over an older one, run
// trackApplications by hand once afterwards and approve the prompt if it
// appears. Apps Script works out which permissions a project needs by reading
// the whole file, and if that set changes, the every-15-minutes trigger keeps
// running under the old approval and fails with "Authorization is required to
// perform that action" until a human re-approves. Nothing is lost while that
// happens — mail stays on the EarlyBird label until it actually posts — but
// nothing gets tracked either, and the only signal is Google's failure email.
// (This is also why nothing below reaches for the signed-in user's address:
// that alone would require a permission no other part of the script needs.)
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
// Where the last replay run stopped, so repeated runs walk forward instead of
// redoing the first page forever. One cursor per replay target.
const CURSOR_PROP = "earlybirdBackfillCursor";
const RETRY_CURSOR_PROP = "earlybirdRetryCursor";

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
      // receivedAt is a UTC instant, so an email that arrived at 8pm local would
      // be filed under tomorrow. Send the local calendar day too.
      localDate: Utilities.formatDate(
        msg.getDate(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      ),
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

// --- Replay: re-post already-processed mail through the current classifier ----
// Run these by hand from the editor (pick the function in the dropdown → Run),
// then read the execution log. Anything still unreadable gets the
// EarlyBird-Unmatched label so you can find it in Gmail.
//
// Idempotent: the server dedupes each message and only ever advances a stage, so
// replaying an email that was already tracked changes nothing.

// Walk a label one page at a time, remembering the position across runs so
// repeated runs move forward instead of redoing the first page forever.
function replayLabel(sourceName, cursorProp, dropOnSuccess) {
  const src = GmailApp.getUserLabelByName(sourceName);
  if (!src) {
    Logger.log("No '" + sourceName + "' label — nothing to replay.");
    return;
  }
  const unmatched = labelOrCreate(SKIPPED_LABEL);
  const props = PropertiesService.getScriptProperties();
  var start = parseInt(props.getProperty(cursorProp) || "0", 10);
  if (isNaN(start) || start < 0) start = 0;

  const threads = src.getThreads(start, BATCH);
  if (threads.length === 0) {
    props.deleteProperty(cursorProp);
    Logger.log(
      "Done — replayed everything in " + sourceName +
        ". (Cursor reset, so running again starts over.)",
    );
    return;
  }

  var counts = { ok: 0, skipped: 0, failed: 0 };
  var removed = 0;
  for (var t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const outcome = postThread(thread);
    counts[outcome]++;
    if (outcome === "skipped") {
      thread.addLabel(unmatched);
    } else if (outcome === "ok" && dropOnSuccess) {
      // Now tracked, so it no longer belongs in the retry queue.
      thread.removeLabel(src);
      removed++;
    }
  }
  // Pulling threads out of the label shifts everything after them down, so the
  // next page starts that many slots earlier.
  props.setProperty(cursorProp, String(start + threads.length - removed));
  Logger.log(
    sourceName + " " + start + "-" + (start + threads.length) + ": " +
      counts.ok + " tracked, " + counts.skipped + " unmatched, " +
      counts.failed + " failed. Run again to continue.",
  );
}

// Full sweep of everything ever processed. Use this once, after a fix that could
// affect any email. Leaves EarlyBird-Done intact.
function backfillApplications() {
  replayLabel(DONE_LABEL, CURSOR_PROP, false);
}

// Just the emails EarlyBird couldn't read last time — far smaller than a full
// sweep, so this is the one to use after each classifier improvement. Threads
// that now classify lose the EarlyBird-Unmatched label, so the queue shrinks
// toward only genuine non-job mail.
function retryUnmatched() {
  replayLabel(SKIPPED_LABEL, RETRY_CURSOR_PROP, true);
}

function resetBackfill() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(CURSOR_PROP);
  props.deleteProperty(RETRY_CURSOR_PROP);
  Logger.log("Cursors reset — the next replay run starts from the beginning.");
}

// --- Diagnose a missing application -------------------------------------------
// When something you applied to never shows up, run this to find out where the
// pipeline lost it. Edit QUERY to the company name, pick diagnoseMail in the
// function dropdown, Run, and read the log. It only reads — nothing is posted.
//
// What the label line tells you:
//   (none)              → this account never labeled it; the filter missed it
//   EarlyBird           → labeled but not processed yet; run trackApplications
//   EarlyBird-Done      → already posted and accepted
//   EarlyBird-Unmatched → posted, but nothing classifiable; run retryUnmatched
// No thread at all → the mail isn't in this account. Check the other account and
// whether forwarding from your university address was active on that date.

const QUERY = "Anduril";

function diagnoseMail() {
  // "in:anywhere" so a thread sitting in Spam or Trash still turns up.
  const threads = GmailApp.search(QUERY + " in:anywhere", 0, 20);
  if (threads.length === 0) {
    Logger.log(
      'No thread matches "' + QUERY +
        '" in this account — the mail never arrived here. (This account is' +
        " whichever Gmail the editor is signed into, top right.)",
    );
    return;
  }
  Logger.log(threads.length + ' thread(s) matching "' + QUERY + '"');
  for (var t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const names = thread.getLabels().map(function (l) {
      return l.getName();
    });
    Logger.log(
      "\\nTHREAD: " + thread.getFirstMessageSubject() +
        "\\n  labels: " +
        (names.length ? names.join(", ") : "(none — nothing labeled it)"),
    );
    const messages = thread.getMessages();
    for (var m = 0; m < messages.length; m++) {
      const msg = messages[m];
      Logger.log(
        "  msg " + (m + 1) + ": " +
          Utilities.formatDate(
            msg.getDate(),
            Session.getScriptTimeZone(),
            "yyyy-MM-dd",
          ) +
          "  from=" + msg.getFrom() +
          "  subject=" + msg.getSubject(),
      );
    }
  }
}
`;
}
