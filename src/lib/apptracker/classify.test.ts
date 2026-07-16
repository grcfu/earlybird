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

test("non-application email → no stage", () => {
  const c = classifyEmail({
    subject: "Your Amazon order shipped",
    body: "Your package is on the way.",
    receivedAt: "2026-07-10",
  });
  assert.equal(c.stage, null);
});
