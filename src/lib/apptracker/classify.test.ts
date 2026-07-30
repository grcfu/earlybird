import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEmail } from "@/lib/apptracker/classify";

// Real (anonymized) emails Grace forwarded, used as ground truth.

const AKUNA = {
  subject: "Fw: Your Application with Akuna Capital",
  from: "gracefu.student@gmail.com",
  receivedAt: "2026-07-15T22:33:00-05:00", // forward time (later, must be ignored)
  body: `From: no-reply@us.greenhouse-mail.io
Sent: Wednesday, July 15, 2026 8:30 AM
To: Fu, Grace <gracefu@wustl.edu>
Subject: Your Application with Akuna Capital

Hi Grace,

Thank you for considering Akuna Capital as an employer.

We appreciate that you've invested your time to apply for the Software Engineer Intern - Python, Summer 2027 role in our Chicago office. It appears this position would not be the best fit for your talents given the existing requirements.

We wish you the best of luck in your search,

Akuna Capital Recruitment`,
};

const TRADE_DESK = {
  subject: "",
  receivedAt: "2026-07-15T09:00:00-05:00",
  body: `Hi Grace,

Thank you for taking the time to apply for the 2027 North America Software Engineering Internship position at The Trade Desk! We're thrilled to receive your application and are currently reviewing it.

To help you understand what's next, here's an overview of our selection process:
Application Review, CodeSignal Online Assessment: If your application stands out, you'll receive an invitation to complete a CodeSignal online assessment.
Recruiter Screen, Technical Screening Interview, Final Round, Offer.

Warm regards,
The Global University Recruiting Team @ The Trade Desk`,
};

const HRT = {
  subject: "",
  receivedAt: "2026-07-14T12:00:00-05:00",
  body: `Hi Grace,

Thank you for your interest in Hudson River Trading's 2027 Summer Internship Program! Please allow up to two weeks for your application to be reviewed. We look forward to starting the process!

Regards,
HRT Campus Team`,
};

test("Akuna: rejection, correct company + original send date", () => {
  const c = classifyEmail(AKUNA);
  assert.equal(c.stage, "rejected");
  assert.equal(c.company, "Akuna Capital");
  // Original 'Sent:' date wins over the (later) forward time.
  assert.equal(c.eventDate, "2026-07-15");
  assert.equal(c.confidence, "high");
});

test("Trade Desk: acknowledgment → applied (not fooled by the OA description)", () => {
  const c = classifyEmail(TRADE_DESK);
  assert.equal(c.stage, "applied");
  assert.equal(c.company, "The Trade Desk");
});

test("HRT: acknowledgment → applied", () => {
  const c = classifyEmail(HRT);
  assert.equal(c.stage, "applied");
  assert.equal(c.company, "Hudson River Trading");
});

test("synthetic: a real interview invite advances the stage", () => {
  const c = classifyEmail({
    subject: "Next steps for your application",
    body: "We'd like to invite you to an interview. Please share your availability for a call next week.",
    receivedAt: "2026-07-10",
  });
  assert.equal(c.stage, "interview");
});

test("synthetic: an OA invite is detected", () => {
  const c = classifyEmail({
    subject: "Complete your assessment",
    body: "You've been invited to complete the CodeSignal online assessment. Here is your assessment link.",
    receivedAt: "2026-07-10",
  });
  assert.equal(c.stage, "assessment");
});

test("company extraction handles 'applying to <Company>' phrasing", () => {
  const c = classifyEmail({
    subject: "",
    body: "Thank you for applying to Akuna Capital for the Software Engineer Intern role.",
    receivedAt: "2026-07-10",
  });
  assert.equal(c.company, "Akuna Capital");
  assert.equal(c.stage, "applied");
});

test("company capture stops at the sentence end, not 40 chars later", () => {
  const c = classifyEmail({
    subject: "Interview invitation - Bank of America Global Technology",
    body: "We would like to invite you to an interview for the Summer Analyst position at Bank of America. Please use the link below to schedule a time.",
    receivedAt: "2026-07-25",
  });
  assert.equal(c.stage, "interview");
  // Regression: the greedy "position at <Company>" pattern used to run past the
  // period and capture "Bank of America. Please use the link belo", which then
  // normalized to a different key and forked a second application row.
  assert.equal(c.company, "Bank of America");
});

test("assessment vendor never beats the real employer", () => {
  const c = classifyEmail({
    subject: "Chicago Trading Company (CTC) invites you to a test at Codility",
    body: "Chicago Trading Company (CTC) invites you to a test at Codility.\n\nGood luck!",
    receivedAt: "2026-07-27",
  });
  assert.equal(c.stage, "assessment");
  // Regression: this tracked "Codility" as the company.
  assert.equal(c.company, "Chicago Trading Company");
});

test("a vendor name is still used when it's the only candidate", () => {
  const c = classifyEmail({
    subject: "Your Application with Codility",
    body: "Thank you for applying to Codility for the Software Engineer Intern role.",
    receivedAt: "2026-07-10",
  });
  assert.equal(c.company, "Codility");
});

// Real subjects from Grace's Gmail backfill log. The BofA pair is the ATS
// "<Company>: <event>" subject form, which no prose pattern matched — every one
// of these was silently skipped as "no company detected".

test("ATS subject-prefix form names the company", () => {
  const c = classifyEmail({
    subject: "Bank of America: Video Interview Invitation",
    body: "Bank of America: Video Interview Invitation",
    receivedAt: "2026-07-28",
  });
  assert.equal(c.company, "Bank of America");
  assert.equal(c.stage, "interview");
});

test("a completed interview still counts as the interview stage", () => {
  const c = classifyEmail({
    subject: "Bank of America: Video Interview Complete",
    body: "Bank of America: Video Interview Complete",
    receivedAt: "2026-07-28",
  });
  assert.equal(c.company, "Bank of America");
  assert.equal(c.stage, "interview");
});

test("Re:/[tag] noise is peeled off before the subject prefix is read", () => {
  const c = classifyEmail({
    subject: "Re: [External] Bank of America: Video Interview Invitation",
    body: "",
    receivedAt: "2026-07-28",
  });
  assert.equal(c.company, "Bank of America");
});

test("a subject prefix that isn't a company is not treated as one", () => {
  for (const subject of [
    "Reminder: GDG on Campus - Transition Interviews (Grace Fu) @ Tue Jul 21",
    "Action Required: Confirm Your Congressional Award Gold Medal Delivery",
  ]) {
    const c = classifyEmail({ subject, body: subject, receivedAt: "2026-07-28" });
    assert.equal(c.stage, null, `${subject} should not be an application event`);
  }
});

test("referral invites and OTP mail are not application events", () => {
  // Both name a real company, so only the missing stage keeps them out.
  for (const subject of [
    "Invitation from Lyn Han to apply to Google",
    "Security code for your application to Old Mission",
  ]) {
    const c = classifyEmail({ subject, body: subject, receivedAt: "2026-07-28" });
    assert.equal(c.stage, null, `${subject} should not be an application event`);
  }
});

// The label feeding the tracker is a broad Gmail filter, so consumer mail lands
// in the classifier too — and it reuses every stage phrase we look for. Without a
// hiring-context requirement these all registered as real applications.
test("consumer mail borrowing our stage phrases is not an application", () => {
  const junk: [string, string][] = [
    ["Aeropostale: We're pleased to offer you 40% off everything", "Shop now before it ends."],
    ["Chase: Your offer letter is waiting", "Claim your new card today."],
    ["USPS: Unfortunately your package was delayed", "Unfortunately, your package could not be delivered."],
    ["CreditWise: You've earned an offer for an additional line of credit", "Congrats!"],
  ];
  for (const [subject, body] of junk) {
    const c = classifyEmail({ subject, body, receivedAt: "2026-07-28" });
    assert.equal(c.stage, null, `${subject} should not be an application event`);
  }
});

test("terse vendor mail still reads as job-related", () => {
  // No "application"/"position"/"role" anywhere — naming Codility is the only
  // signal that this is hiring mail at all.
  const c = classifyEmail({
    subject: "Chicago Trading Company (CTC) invites you to a test at Codility",
    body: "Chicago Trading Company (CTC) invites you to a test at Codility.\n\nGood luck!",
    receivedAt: "2026-07-27",
  });
  assert.equal(c.stage, "assessment");
  assert.equal(c.company, "Chicago Trading Company");
});

// Real Ashby-sent acknowledgment from Deepgram. It was tracked as INTERVIEW
// because the body says "schedule an interview" — inside a conditional about
// what happens *if* the application looks like a fit.
const DEEPGRAM_ACK = {
  subject: "Thank you for applying to Deepgram!",
  from: "Deepgram Recruiting Team <no-reply@ashbyhq.com>",
  receivedAt: "2026-07-18T10:00:00Z",
  body: `Hello Grace!

We've received your application for the Software Engineering- Internship role at http://deepgram.com, and we're excited that you're interested in joining our team!

Our hiring team reviews every application thoroughly, so it may take some time before you hear back from us due to the high number of applications for this role. Once we've had a chance to review your background, we will reach out to schedule an interview as soon as possible if your experience looks like a good fit.

If you are not selected for this position, keep an eye on our https://deepgram.com/careers as we're growing quickly and will be opening additional opportunities in the near future.

We appreciate your patience, and thanks again for your interest in Deepgram!`,
};

test("Deepgram: a promised future interview is still just 'applied'", () => {
  const c = classifyEmail(DEEPGRAM_ACK);
  assert.equal(c.stage, "applied");
  assert.equal(c.company, "Deepgram");
  assert.equal(c.role, "Software Engineering- Internship");
});

test("hypothetical stage phrases don't advance the stage", () => {
  const hedged: [string, string][] = [
    ["conditional assessment", "Thank you for applying. If your application stands out, you'll be invited to complete a HackerRank assessment."],
    ["conditional offer", "Thank you for applying. If we extend you an offer, onboarding takes two weeks."],
    ["process overview", "Thanks for applying! Our process typically includes an interview invitation after the resume screen."],
  ];
  for (const [label, body] of hedged) {
    const c = classifyEmail({ subject: "Thanks for applying", body, receivedAt: "2026-07-10" });
    assert.equal(c.stage, "applied", `${label} should stay at applied`);
  }
});

test("'unfortunately' alone is not a rejection", () => {
  // Extremely common in acknowledgments; used to mark the application rejected.
  const c = classifyEmail({
    subject: "Thank you for applying to Acme",
    body: "Thank you for applying to Acme. Unfortunately we cannot respond to every applicant individually.",
    receivedAt: "2026-07-10",
  });
  assert.equal(c.stage, "applied");
});

test("'unfortunately' about your application is a rejection", () => {
  const c = classifyEmail({
    subject: "Acme: update on your application",
    body: "Unfortunately, we will not be advancing your application for this role.",
    receivedAt: "2026-07-10",
  });
  assert.equal(c.stage, "rejected");
});

test("eventDate uses the reader's calendar day, not the UTC instant", () => {
  const evening = {
    subject: "Acme: Video Interview Invitation",
    body: "x",
    receivedAt: "2026-07-15T21:30:00-05:00", // 02:30 UTC on the 16th
  };
  // Without the local day, an evening email is filed under tomorrow.
  assert.equal(classifyEmail(evening).eventDate, "2026-07-16");
  assert.equal(
    classifyEmail({ ...evening, localDate: "2026-07-15" }).eventDate,
    "2026-07-15",
  );
});

test("a quoted forward date still outranks the local day", () => {
  const c = classifyEmail({
    subject: "Fw: Your Application with Akuna Capital",
    body: "Sent: Wednesday, July 15, 2026 8:30 AM\n\nThank you for applying to Akuna Capital.",
    receivedAt: "2026-07-20T12:00:00Z",
    localDate: "2026-07-20",
  });
  assert.equal(c.eventDate, "2026-07-15");
});

// Sender-derived company names. These all come from real mail that produced a
// junk company: the prose names the *role*, so the employer has to come from the
// From header instead.

test("From display name beats a role-shaped prose match", () => {
  // Was tracked as "R-2025-61963 Data and Analytics Summer 20".
  const c = classifyEmail({
    subject:
      "An update on your Southwest Airlines job application for R-2025-61963 Data and Analytics Summer 2026 Internships - TX-Dallas",
    from: "Southwest Airlines <swa@myworkday.com>",
    body: "Hello Grace,\n\nThank you for your interest in the R-2025-61963 Data and Analytics Summer 2026 Internships position and a career at Southwest Airlines!",
    receivedAt: "2026-02-02",
  });
  assert.equal(c.company, "Southwest Airlines");
});

test("From display name drops recruiting boilerplate", () => {
  // Was tracked as "Software" / "Silicon" / "Explore" — the role's first word.
  const c = classifyEmail({
    subject: "Thank you for your application!",
    from: "Microsoft Careers <donotreply@email.careers.microsoft.com>",
    body: "Hi Grace,\nThank you for taking the time to submit your application for Silicon\nEngineering Intern (Job number: 200013334).",
    receivedAt: "2025-12-07",
  });
  assert.equal(c.company, "Microsoft");
});

test("sending domain is the last resort when nothing names the company", () => {
  // Was tracked as "Software Engineering Intern - Summer".
  const c = classifyEmail({
    subject: "Grace, we have received your application",
    from: "careers@trimble.com",
    body: "Hello Grace,\nWe have received your application for Software Engineering Intern - Summer\n2026. We are currently reviewing it.",
    receivedAt: "2025-12-10",
  });
  assert.equal(c.company, "Trimble");
});

test("a vendor relay falls back to the display name, not the vendor domain", () => {
  assert.equal(
    classifyEmail({
      subject: "Thank you for applying to Deepgram!",
      from: "Deepgram Recruiting Team <no-reply@ashbyhq.com>",
      body: "We've received your application.",
      receivedAt: "2026-07-18",
    }).company,
    "Deepgram",
  );
  // The parenthetical acronym is dropped so the key matches the spelled-out name.
  assert.equal(
    classifyEmail({
      subject: "Your assessment is ready",
      from: '"Chicago Trading Company (CTC) via Codility" <robot@codility.com>',
      body: "Please complete your assessment.",
      receivedAt: "2026-07-24",
    }).company,
    "Chicago Trading Company",
  );
});

test("people are never treated as companies", () => {
  const senders = [
    "Grace F <gracefu201@gmail.com>", // the user's own mail in a thread
    '"Gabel, Harrison" <gabelh@wustl.edu>', // surname-first
    "Ryan McCulla <ryan.mcculla@slu.edu>", // display name spells the address
    '"DBBS ysp.summerfocus" <ysp.summerfocus@wustl.edu>', // mailbox in the name
  ];
  for (const from of senders) {
    const c = classifyEmail({
      subject: "Re: Internship Inquiry",
      from,
      body: "Thank you for your application.",
      receivedAt: "2025-01-01",
    });
    assert.ok(
      c.company === null || !/Grace|Gabel|McCulla|summerfocus/i.test(c.company),
      `${from} should not yield a person as the company (got ${c.company})`,
    );
  }
});

test("an organization with a one-word name still comes through", () => {
  // Guard against the person heuristic over-firing: "MITES" <mitesapp@mit.edu>
  // is an org even though its name appears inside the mailbox.
  const c = classifyEmail({
    subject: "Application received",
    from: "MITES <mitesapp@mit.edu>",
    body: "We have received your application.",
    receivedAt: "2024-04-17",
  });
  assert.equal(c.company, "MITES");
});

test("non-application email → no stage", () => {
  const c = classifyEmail({
    subject: "Your Amazon order shipped",
    body: "Your package is on the way.",
    receivedAt: "2026-07-10",
  });
  assert.equal(c.stage, null);
});
