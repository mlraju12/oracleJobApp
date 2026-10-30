# Audit of the 45-listing result

Captured 2026-10-30 from the local feed of active Oracle Cloud HCM and mixed listings, before Dice results were mixed in and before any country scope was applied. The in-memory database does not keep that process after a reload. This audit uses the stored titles, employers, original URLs, and published-date field from that result. Dates were not filled in for the 29 listings whose sources did not provide one. Pages were not marked open because they return HTTP 200.

## What was retained

| Check | Result |
| --- | --- |
| Listings audited | 45 |
| Original posting URL stored | 45 |
| Published date provided by the source | 16 |
| Published date left unknown | 29 |
| Marked open only because a page returned HTTP 200 | 0 |
| Removed by a failed or partial refresh | 0 |

A listing in this set was active because the employer’s own job list included the requisition: Greenhouse Job Board API, Lever Postings API, or the public Deloitte, EY, or PwC search page. That is `listed_by_source`. A bare HTTP 200 is now stored as `not_established` and the listing status stays unknown.

Last verification for this set is the collection run on 2026-10-30. The audit extract did not keep a separate clock time on every row, so none was invented. New collections store `lastCheckedAt` from the run that saw the requisition in the source list.

## Corrected classification

These postings are on the organization’s own career site or ATS board. A consulting firm hiring for its own team is a direct employer posting. It is not an intermediary, and no end client was invented.

| Employer | Listings | Employer type | Hiring relationship | Published date |
| --- | --- | --- | --- | --- |
| Deloitte | 15 | Consulting firm | Hiring for its own team | Not published by the source |
| EY | 10 | Consulting firm | Hiring for its own team | Not published by the source |
| PwC | 2 | Consulting firm | Hiring for its own team | Not published by the source |
| Highstreet IT | 1 | Consulting firm | Hiring for its own team | Not published by the source |
| NextOvation | 1 | Consulting firm | Hiring for its own team | Not published by the source |
| Apex IT | 9 | Consulting firm | Hiring for its own team | Provided on all 9 |
| Attain Partners | 1 | Consulting firm | Hiring for its own team | 2026-10-21 |
| Sphere IT | 1 | Consulting firm | Hiring for its own team | 2025-04-16 |
| Accenture Federal Services | 4 | Consulting firm | Hiring for its own team | Provided on all 4 |
| Pico | 1 | End-user organization | Hiring for its own team | 2026-08-05 |

Pico is the only end-user organization in the 45. The others are consulting or implementation firms posting their own jobs. None of the 45 is a staffing advertisement. Dice recruiters are classified separately when they appear: staffing agency, hiring relationship unknown, because the stored Dice fields do not name a client.

Requisition identifiers visible in the original URLs, not invented:

- PwC: `695924WD`, `753664WD`
- Deloitte JobDetail ids include `362486`, `373454`, `371963`, `368878`, `362056`, `362058`, `356051`, `362060`, `369613`, `366120`, `365585`, `373048`, `373026`, `373036`, `373039`
- EY job ids include `1450556933`, `1447644033`, `1447641833`, `1450556133`, `1450556233`, `1437077433`, `1448360733`, `1452763833`, `1445764733`, `1206492201`
- Greenhouse job ids include Attain `5459690008`, Sphere `4523381008`, Apex `4451171009`, `4372369009`, `4382322009`, `4332178009`, `4300041009`, `4331881009`, `4299729009`, `4315620009`, `4360040009`, Pico `4702440006`, Accenture Federal `4723834006`, `4723346006`, `4723411006`, `4704739006`
- Lever: Highstreet `5eb156dc-8f83-440e-ba59-6c8000c26750`, NextOvation `24a8ce70-cfbc-4eef-b011-c16d65be071b`

## Coverage after the audit

No new employer was added. Discovery was not expanded until this audit was written.

Still unsupported, with the blocker recorded on the source:

- KPMG US careers: the public HTML did not include a job list.
- Accenture corporate search: the public HTML did not include a job list. Accenture Federal remains the Greenhouse board above.

Not added, because there is no permitted public job read for this app: Workday CXS, Avature, Oracle Career Site, LinkedIn, and Indeed. End-user organizations that post only on those systems stay outside the feed.

Country scope stays unset until someone chooses United States. Choosing it leaves a remote job in when eligibility is unknown and leaves out a job whose text names a non-US place.

## Tests

`npm test`: 42 passed. New checks cover a missing published date, an HTTP response that does not mean applications are open, a consulting firm’s own board versus a Dice recruiter, and a Dice direct hire that is not labeled an end user. Existing tests still cover duplicate requisitions kept apart and a failed or partial refresh that does not close listings.
