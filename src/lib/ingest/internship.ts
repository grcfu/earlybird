// Whether a job title denotes an internship / co-op. ATS boards return every
// role, so each provider source filters to internships with this.
//
// Word-boundaried so it won't match "internal" / "international". Covers
// intern, interns, internship(s), co-op/coop, apprentice(ship).
const INTERN_RE =
  /\b(interns?|internships?|co-?ops?|apprentices?(hips?)?)\b/i;

// A few titles slip through ("Internal Tools Engineer" is already excluded by
// the boundary, but recruiter/coordinator intern-adjacent noise isn't a job we
// want). Kept minimal on purpose.
const EXCLUDE_RE = /\b(intern(ship)? coordinator|recruit(er|ing))\b/i;

export function isInternship(title: string): boolean {
  return INTERN_RE.test(title) && !EXCLUDE_RE.test(title);
}
