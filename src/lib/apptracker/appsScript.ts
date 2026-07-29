// Builds the Google Apps Script the user pastes into script.google.com for each
// Gmail account. It scans a label, posts each message to the ingest endpoint,
// then moves the thread to a "done" label so it's processed once. The classifier
// lives server-side, so this script never needs to change.

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

const ENDPOINT = ${JSON.stringify(endpoint)};
const KEY = ${JSON.stringify(key)};
const LABEL = "EarlyBird";
const DONE_LABEL = "EarlyBird-Done";
// Emails that reached EarlyBird but couldn't be read as an application event
// (no company or no stage recognized). They land here instead of vanishing, so
// you can see exactly what didn't get tracked.
const SKIPPED_LABEL = "EarlyBird-Unmatched";

function trackApplications() {
  const label = GmailApp.getUserLabelByName(LABEL);
  if (!label) {
    Logger.log("Create a Gmail label named '" + LABEL + "' first.");
    return;
  }
  const done =
    GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const unmatched =
    GmailApp.getUserLabelByName(SKIPPED_LABEL) ||
    GmailApp.createLabel(SKIPPED_LABEL);

  const threads = label.getThreads(0, 50);
  for (var t = 0; t < threads.length; t++) {
    const thread = threads[t];
    const messages = thread.getMessages();
    var failed = false;   // couldn't reach the server — retry next run
    var skipped = false;  // server got it but couldn't classify it
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
          skipped = true;
          Logger.log("SKIPPED (" + result.reason + "): " + msg.getSubject());
        } else if (result) {
          Logger.log(
            result.status + " " + result.company + " -> " + result.stage,
          );
        }
      } catch (e) {
        failed = true;
        Logger.log(e);
      }
    }
    // Only retire the thread once every message actually landed — otherwise a
    // transient outage would drop those emails permanently.
    if (failed) continue;
    thread.removeLabel(label);
    thread.addLabel(skipped ? unmatched : done);
  }
}
`;
}
