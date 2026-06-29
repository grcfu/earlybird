# EarlyBird 🐦

Real-time tracker for SWE / ML / data / quant / hardware **internship** postings. It
ingests fresh roles from public job-listing feeds, dedupes them across sources,
surfaces the newest openings (default: last 2 days), and emails/DMs users a
personalized alert when roles match their filters.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**
- **Prisma 7** with the `pg` driver adapter (client generated to `src/generated/prisma`)
- **Postgres** (Neon-hosted in production; any Postgres works locally)
- **Resend** for email notifications (Discord + Telegram channels also supported)
- Deployed on **Vercel**, with ingestion + notifications driven by **Vercel Cron**

## Getting started

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (keep `?sslmode=require` for Neon/Supabase) |
| `RESEND_API_KEY` | for email | Resend API key — https://resend.com |
| `RESEND_FROM` | for email | Verified sender; `onboarding@resend.dev` works for testing |
| `APP_URL` | recommended | Public base URL, used for links in notification emails |
| `CRON_SECRET` | in prod | Shared secret guarding `/api/ingest` and `/api/notify` (see [Cron & deployment](#cron--deployment)) |

### 3. Set up the database

```bash
npx prisma migrate deploy   # apply migrations
npx prisma generate         # generate the client (also runs on install)
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

- **Ingestion** (`src/lib/ingest`) pulls from two kinds of sources, categorizes
  roles, and dedupes by a hash of company + title + URL host/path so the same
  role across sources collapses into one listing (the earliest known
  `datePosted` wins, so the truest "went live" time is kept):
  - **Direct company ATS** — `boards-api.greenhouse.io`, `api.lever.co`,
    `api.ashbyhq.com`, Workday (`*.myworkdayjobs.com`), and `amazon.jobs`. These
    are each company's own source of truth, so a new role appears within ~1h of
    posting — typically days before the aggregators. Company registries live in
    `src/lib/ingest/sources/*.ts`; add a verified board token to expand coverage.
  - **Community aggregators** — vanshb03 + SimplifyJobs JSON feeds (broad, but lag).

  ATS sources are listed first so their direct apply links and fresh dates win in
  the merge. Each ATS board is filtered to internships by title
  (`src/lib/ingest/internship.ts`).
- **Recency** is tracked via a materialized `effectiveAt` column (the posting date
  when present and sane, otherwise the time we first saw it), which powers the
  "newest in the last N days" views.
- **Notifications** (`src/lib/notify`) match each user's enabled preference
  (categories, keywords, locations, recency window) against new listings and send
  via their chosen channel. Two frequencies:
  - `INSTANT` — sent on every notify run that has new matches.
  - `DAILY_DIGEST` — sent once per day, only during the user's configured
    `digestHour` (UTC). A `SentNotification` record per (user, listing) guarantees a
    role is never alerted twice.

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/ingest` | GET/POST | Run ingestion across all sources. Cron-triggered; guarded by `CRON_SECRET`. |
| `/api/notify` | GET/POST | Send pending notifications. `?force=1` bypasses digest scheduling ("send now"). Guarded by `CRON_SECRET`. |
| `/api/listings` | GET | Query listings for the UI. |
| `/api/preferences` | — | Manage a user's alert rules. |

You can also run the jobs from the CLI without the HTTP layer:

```bash
npm run ingest   # scripts/ingest.ts
npm run notify   # scripts/notify.ts
```

## Cron & deployment

The app is **hosted on Vercel** (the free Hobby plan is fine — it runs the
Node/Postgres app without issue). Scheduling is driven by **GitHub Actions**, not
Vercel Cron: Vercel's Hobby plan caps cron at once per day, whereas a GitHub
Actions schedule runs **hourly for free**. The workflow lives in
[`.github/workflows/cron.yml`](./.github/workflows/cron.yml) and runs hourly:

```yaml
on:
  schedule:
    - cron: "15,45 * * * *" # every 30 min (:15 and :45), UTC
```

**Ingest runs on the runner**, not via the Vercel endpoint — fanning out across
40+ company ATS boards would exceed Vercel's 60s function cap, so the Action
checks out the repo and runs `npm run ingest` directly (hitting the DB). Notify
stays a quick `curl` to `/api/notify`.

**One-time setup.** Add these repository secrets under
*Settings → Secrets and variables → Actions*:

| Secret | Value |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string — the ingest step writes to it directly |
| `DEPLOY_URL` | Public base URL of the deployment, e.g. `https://earlybird.vercel.app` |
| `CRON_SECRET` | Same value you set as `CRON_SECRET` in the Vercel project env |

> Scheduled workflows only run from the **default branch**, and GitHub disables
> them after ~60 days of repo inactivity. You can also trigger a run any time from
> the Actions tab (`workflow_dispatch`).

**Securing the endpoints.** `/api/ingest` and `/api/notify` require `CRON_SECRET`
when it is set. The GitHub workflow sends it as an `x-cron-secret` header. You can
also pass it as `Authorization: Bearer <secret>` or a `?secret=` query param. When
`CRON_SECRET` is unset (local dev), the guard falls open so the routes stay easy to
hit by hand.

Because notify runs **hourly**, daily-digest preferences fire at each user's chosen
`digestHour` (UTC) — the digest is sent on the first run at or after that hour each
day, so an occasionally delayed cron run won't skip it.

## Testing

```bash
npm test     # node --test over src/**/*.test.ts
npm run lint
```
