# Oracle HCM Opportunities

Discover and organize current Oracle Cloud HCM openings from public employer career boards. Each account collects those boards automatically. The app keeps employment type separate from working hours, leaves unpublished fields unknown, and does not submit applications or contact employers.

This repository is a separate application. It does not read payroll results, employee pay data, or PayrollRecon collections.

## Stack

- Node.js 22, CommonJS, Express
- React 19, Vite, Tailwind, Lucide
- MongoDB and Mongoose
- Session cookies, CSRF double-submit, optional TOTP MFA
- Personal tenant isolation: each account reads only its own sources and listings
- Redis and BullMQ on the Heroku worker when `REDIS_URL` is set
- S3 when `S3_BUCKET` or `OBJECT_STORAGE_DRIVER=s3` is set; local files otherwise
- Jest and Supertest

## Setup

```bash
npm install
npm install --prefix client
copy .env.example .env
```

Set `SESSION_SECRET` and `MONGODB_URI` in `.env`.

```bash
npm start
```

The API listens on port 3050. Build the client and Express will serve it:

```bash
npm run build:client
npm start
```

For a local UI without a MongoDB install:

```bash
npm run build:client
npm run dev
```

That starts an in-memory database and serves `client/dist`.

Development with Vite on port 5173 proxies `/api` to port 3050:

```bash
npm start
npm --prefix client run dev
```

Tests:

```bash
npm test
```

Live public-source check (counts and titles only, no descriptions stored):

```bash
npm run verify:sources
```

## What the first release does

- Collect published Oracle HCM requirements from built-in public boards. Greenhouse and Lever requirements come from those public APIs. No per-employer registration is required.
- Direct client roles are separate from consulting-firm roles. Pico’s own Oracle Fusion HCM posting is the verified direct-client API source. Attain Partners, DSP-Eclipsys, and Highstreet IT are additional consulting firms whose public APIs include Oracle HCM requirements.
- Big 5 coverage is the public Oracle HCM search, not every role at those firms. Deloitte, EY, and PwC US search pages are collected. Accenture Federal Services uses its public Greenhouse board. KPMG US and Accenture’s main search page do not include listings in the public HTML, so those sources stay unsupported.
- Upload one PDF or Word resume on the account. Apply opens the employer’s application URL and keeps a private record. The form is completed on the employer site.
- Register an extra employer source and keep it paused until terms are reviewed.
- Greenhouse Job Board API and Lever Postings API adapters.
- Import one public job URL. Greenhouse and Lever job URLs use the documented read endpoints. Other public pages are stored as text.
- Search, filter, open the original posting, and read a “why this matches” explanation.
- Save searches, save listings, and track a personal status.
- Collection runs, failure history, and a review queue.

A listing is marked removed only when a **complete** source snapshot no longer contains it. A failed or partial refresh leaves existing listings active and shows presence as unverified.

## Supported sources and limits

Checked 2026-10-30.

| Adapter | Documentation | Access |
| --- | --- | --- |
| Greenhouse Job Board API | https://developers.greenhouse.io/job-board.html | Public GET. No API key. `GET /v1/boards/{board_token}/jobs` returns the full published list and `meta.total`. There is no documented page parameter on that list. `content=true` adds the description. `first_published` and `pay_input_ranges` are on the single-job endpoint and are read only when “fetch details” is enabled. |
| Lever Postings API | https://github.com/lever/postings-api | Public JSON GET. Pagination is `skip` and `limit`. Global host `api.lever.co`. EU host `api.eu.lever.co`. |
| Manual URL | None | One public page. This is not a full-site snapshot, so it never closes other listings. |
| Deloitte public search | https://apply.deloitte.com/en_US/careers/SearchJobs/Oracle%20Cloud%20HCM | Public HTML JobDetail links plus the linked RSS descriptions. Feed `jobOffset` did not change the first items, so pagination follows HTML `jobOffset` links. A capped or undescribed page stays partial. |
| EY public search | https://careers.ey.com/ey/search/?q=Oracle%20Cloud%20HCM&startrow=0 | Public HTML `/ey/job/` links and `startrow` pages. Each job page is fetched up to a cap. A cap or a failed page stays partial. |
| PwC US public search | https://jobs-us.pwc.com/us/en/search-results?keywords=Oracle%20HCM | The first response embeds job records and apply URLs. If `totalHits` is larger than the embedded jobs, the run stays partial and does not close listings that were not on that page. |
| Dice public job search | https://www.dice.com/about/mcp | Unauthenticated `search_jobs` at `https://mcp.dice.com/mcp`. The search covers Oracle Cloud and Fusion HCM, payroll, time and labor, absence, fast formulas, benefits, journeys, HCM security, HCM reports, entry level, and intern postings. Results include `postedDate` and the Dice job URL. Dice’s own guide says to hand the candidate that link. This app does not submit the Dice form. |

Not implemented, because no official public read API was verified for them: Oracle Career Site search, Workday CXS, KPMG Avature, Accenture’s main job search, and any flow that requires a login or CAPTCHA.

Application POST endpoints exist in Greenhouse and Lever docs and require the employer’s secret key. This app does not call them. PwC apply links may open Workday; the user completes that form. The saved resume is never posted to an employer.

Greenhouse and Lever sources cannot be enabled until terms review is `public_read_documented`. A blocked or rejected review cannot be enabled. The adapter backs off on HTTP 429 and 5xx. It stops on 401 or 403.

Accenture Federal Services publishes Oracle Cloud HCM roles on the public Greenhouse board token `accenturefederalservices`. That board is collected automatically. Accenture’s corporate job search is a separate unsupported source.

Lever’s `leverdemo` site is the documented example API. It is not an Oracle HCM employer.

## Heroku shape

`Procfile` defines `web` and `worker`. The worker requires `REDIS_URL` and `MONGODB_URI`. Do not deploy this repository as part of the initial build.

Without Redis, **Refresh now** runs in the web process.

## Remaining work

- Organization accounts beyond the personal tenant.
- More ATS adapters after their public docs are checked.
- Optional per-job Greenhouse detail fetch for boards where pay and `first_published` are not in the list payload.
- A scheduled refresh UI that shows the next attempt time while Redis is connected.
- Richer HTML extraction for career pages that are not Greenhouse or Lever.
