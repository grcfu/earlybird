// Email → application-event classifier for the auto-tracker.
//
// The Gmail Apps Script ships each job email's raw fields here (via the ingest
// endpoint); this module decides the company, role, stage, and event date. Kept
// dependency-free and pure so it's easy to unit-test against real emails.

export interface RawEmail {
  subject: string;
  body: string; // plain-text body
  from?: string; // envelope From (may be a forwarder, e.g. your own address)
  receivedAt?: string | Date; // when Gmail received it (fallback date)
}

// The lifecycle stages we detect. Ordered loosely earliest → latest.
export type AppStage =
  | "applied"
  | "assessment"
  | "interview"
  | "offer"
  | "rejected";

export interface Classification {
  company: string | null;
  role: string | null;
  stage: AppStage | null; // null = not a recognizable application email
  eventDate: string; // YYYY-MM-DD — the original send date if forwarded, else received
  confidence: "high" | "low";
}

// --- Stage detection --------------------------------------------------------
// Order matters: decisive outcomes (offer/reject) win over invites, which win
// over a plain acknowledgment. Phrasing is chosen to fire on real *events*, not
// on process-overview paragraphs (e.g. "our process includes an assessment").

const OFFER =
  /pleased to offer|excited to offer|happy to offer|delighted to offer|offer of (employment|internship)|extend(?:ing)? (?:you )?an offer|your offer letter|formal offer/i;

const REJECT =
  /\bunfortunately\b|we regret|regret to inform|(will )?not (?:be )?(?:moving|proceeding) forward|not moving forward|decided (?:not to|to not) (?:move|proceed|advance)|not (?:be )?(?:a|the) (?:best |strong )?(?:fit|match)|move forward with other (?:candidates|applicants)|pursue other candidates|(?:have|has) (?:not )?(?:been )?(?:not )?selected other|were not selected|no longer under consideration|position (?:has been|is now|was) filled|won'?t be (?:moving|advancing)|not to move forward with your/i;

// Actual invitations to interview (not descriptions of an interview step).
// The trailing alternatives are the noun-phrase forms ATSes put in subject lines
// ("Bank of America: Video Interview Invitation") — specific enough that a
// process-overview paragraph won't trip them.
const INTERVIEW_INVITE =
  /(?:invite|invitation|would like|we'?d like) (?:you )?to (?:an? )?(?:interview|conversation|phone call|video call|chat|screen)|schedule (?:a|an|your) (?:interview|call|screen|conversation|chat)|set up (?:a|an|your) (?:interview|call|time)|your interview (?:is|has been) scheduled|availability (?:for|to) (?:an? )?(?:interview|call|chat|screen)|move forward (?:with|to) (?:an? )?interview|invite you to the next (?:round|step)|\binterview (?:invitation|invite)\b|\binvitation to (?:a |an |your )?(?:video |phone |technical )?interview\b|\b(?:video |phone |technical )?interview (?:complete|completed)\b/i;

// Actual OA/assessment invitations (imperative or "you've been invited"), not
// "if you advance you'll receive an assessment".
const OA_INVITE =
  /(?:invited|invite you) to (?:complete|take)|invit(?:es|ed|e) you to (?:a |an |the )?(?:test|assessment|coding challenge|technical challenge)|please complete (?:the|your) (?:online )?(?:assessment|codesignal|hackerrank|coding challenge)|complete your (?:online )?assessment|(?:your )?(?:assessment|codesignal|hackerrank) (?:link|invitation|is ready)|here is your (?:assessment|coding)/i;

// Plain acknowledgment that an application was received.
const ACK =
  /thank you for (?:applying|your application|your interest|considering|taking the time to apply)|thanks for applying|we(?:’|'|)?ve received your application|your application (?:has been|was) received|application received|received your application|currently reviewing your application|we are (?:currently )?reviewing/i;

function detectStage(text: string): AppStage | null {
  if (OFFER.test(text)) return "offer";
  if (REJECT.test(text)) return "rejected";
  if (INTERVIEW_INVITE.test(text)) return "interview";
  if (OA_INVITE.test(text)) return "assessment";
  if (ACK.test(text)) return "applied";
  return null;
}

// --- Date -------------------------------------------------------------------
// For forwarded mail, the true event date is the ORIGINAL send date embedded in
// the quoted header ("Sent:"/"Date:"), not when you forwarded it.

function parseForwardedDate(body: string): Date | null {
  const m = body.match(/^\s*(?:Sent|Date):\s*(.+?)\s*$/im);
  if (!m) return null;
  // Strip a leading weekday name so Date can parse it reliably.
  const cleaned = m[1].replace(/^\s*[A-Za-z]+day,\s*/i, "").trim();
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// --- Company / role extraction ---------------------------------------------

function clean(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/[!.,;:]+$/, "")
    .replace(/'s$/, "")
    .trim();
}

// Assessment platforms, ATSes and job boards that mail on an employer's behalf.
// Their name sits exactly where a company name would ("...invites you to a test
// at Codility"), so a naive match tracks the vendor instead of the employer. We
// don't drop these outright — a vendor candidate is only ever a last resort, so
// nothing is lost if the vendor name really is all the email gives us.
const VENDORS = new Set([
  "codility", "hackerrank", "codesignal", "karat", "hirevue", "coderpad",
  "woven", "byteboard", "shl", "pymetrics", "criteria", "imocha", "testgorilla",
  "greenhouse", "lever", "ashby", "workday", "smartrecruiters", "workable",
  "icims", "taleo", "jobvite", "bamboohr", "successfactors", "brassring",
  "indeed", "linkedin", "handshake", "wellfound", "simplify", "glassdoor",
  "ziprecruiter", "myworkday",
]);

// Words that sit in the same grammatical slot as a company name ("We would like
// to invite you...", "Reminder: ...") but are never one. Keeps the looser
// subject-prefix and sentence-opening patterns from inventing companies.
const STOPWORDS = new Set([
  // sentence openers
  "we", "i", "you", "your", "our", "us", "they", "it", "this", "that", "these",
  "hi", "hello", "dear", "thank", "thanks", "please", "congratulations",
  "congrats", "unfortunately", "however", "additionally", "team", "the team",
  "a", "an", "as", "if", "and", "but", "so", "there", "here", "who", "what",
  "he", "she",
  // subject-line prefixes that look like "<Company>: ..." but aren't
  "reminder", "reminders", "update", "updates", "action required", "notice",
  "important", "urgent", "alert", "news", "newsletter", "confirmation",
  "confirmed", "receipt", "notification", "status", "application",
  "applications", "next steps", "invitation", "invite", "careers", "career",
  "jobs", "job", "hiring", "recruiting", "recruitment", "attention", "note",
  "fyi", "heads up", "final reminder", "follow up", "re", "fwd", "fw",
]);

function isStopword(name: string): boolean {
  return STOPWORDS.has(name.toLowerCase().trim());
}

function isVendor(name: string): boolean {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return false;
  // Match the whole squashed name ("code signal") or its first word
  // ("Codility Ltd"), so vendor spellings don't slip past on a suffix.
  return VENDORS.has(words.join("")) || VENDORS.has(words[0]);
}

// Peel the reply/forward and bracket-tag noise off a subject so the patterns see
// the real line: "Re: [Action Required] Acme: Next steps" → "Acme: Next steps".
function bareSubject(subject: string): string {
  let s = subject.trim();
  let prev: string;
  do {
    prev = s;
    s = s
      .replace(/^\s*(?:re|fwd|fw)\s*:\s*/i, "")
      .replace(/^\s*\[[^\]]{1,40}\]\s*/, "")
      .trim();
  } while (s !== prev && s.length > 0);
  return s;
}

function extractCompany(subject: string, body: string): string | null {
  const patterns: RegExp[] = [
    // "Your Application with/to/at Akuna Capital"
    /application (?:with|to|at|for)\s+([A-Z][A-Za-z0-9.&'\- ]{1,40})/,
    // "Thank you for applying to Akuna Capital [for ...]"
    /appl(?:y|ied|ying)\s+(?:to|with)\s+([A-Z][A-Za-z0-9.&'\- ]{1,40}?)(?:\s+for\b|'s|[.!,]|\s*$)/,
    // "...interest in Hudson River Trading's 2027..."
    /interest in\s+([A-Z][A-Za-z0-9.&'\- ]{1,40}?)(?:'s|\s+\d{4}|[.!,])/,
    // "...considering Akuna Capital as an employer"
    /considering\s+([A-Z][A-Za-z0-9.&'\- ]{1,40}?)\s+as (?:an? )?(?:employer|company)/,
    // "Chicago Trading Company (CTC) invites you to a test at Codility" — the
    // employer leads, the assessment vendor trails. The optional parenthetical
    // absorbs a trailing acronym so it doesn't break the match.
    /^\s*([A-Z][A-Za-z0-9.&'\- ]{1,40}?)(?:\s*\([^)]{1,20}\))?\s+(?:invites?|has invited|would like)\b/m,
    // "...position at The Trade Desk!" — lazy + anchored on a terminator, or it
    // runs past the company and swallows the rest of the sentence.
    /\b(?:position|role|internship|opportunity|opening)\b[^.\n]{0,20}?\bat\s+([A-Z][A-Za-z0-9.&'\- ]{1,40}?)(?:[.!,]|\s+(?:in|for|office|located)|\s*$)/m,
    // generic "at <Company>" fallback
    /\bat\s+([A-Z][A-Za-z0-9.&'\- ]{1,40}?)(?:[.!,]|\s+(?:in|for|office|located)|\s*$)/m,
    // "Bank of America: Video Interview Invitation" — the ATS subject-line form,
    // where the employer is just a colon-delimited prefix and no prose names it.
    // Last resort, and gated by STOPWORDS so "Reminder:" can't become a company.
    /^([A-Z][A-Za-z0-9.&'\- ]{1,40}?):\s+\S/,
  ];
  // Collect every candidate in priority order, then prefer the first that isn't
  // a hiring vendor — otherwise "a test at Codility" beats the real employer.
  const candidates: string[] = [];
  for (const src of [bareSubject(subject), body]) {
    for (const p of patterns) {
      const m = src.match(p);
      if (m?.[1]) {
        const c = clean(m[1]);
        if (c.length >= 2 && !/^your\b/i.test(c) && !isStopword(c)) {
          candidates.push(c);
        }
      }
    }
  }
  return candidates.find((c) => !isVendor(c)) ?? candidates[0] ?? null;
}

function extractRole(body: string): string | null {
  const m = body.match(
    /(?:for|as)\s+(?:the\s+|our\s+|a\s+|an\s+)?([A-Z0-9][A-Za-z0-9.,\-/ ]{3,70}?)\s+(?:position|role|opening|opportunity|internship program|internship)\b/,
  );
  if (m?.[1]) return clean(m[1]);
  return null;
}

// --- Entry point ------------------------------------------------------------

export function classifyEmail(email: RawEmail): Classification {
  const text = `${email.subject}\n${email.body}`;
  const stage = detectStage(text);

  const eventDate =
    parseForwardedDate(email.body) ?? toDate(email.receivedAt) ?? new Date();

  const company = extractCompany(email.subject, email.body);
  const role = extractRole(email.body);

  return {
    company,
    role,
    stage,
    eventDate: isoDay(eventDate),
    // High only when we have both a stage and a company to attach it to.
    confidence: stage && company ? "high" : "low",
  };
}
