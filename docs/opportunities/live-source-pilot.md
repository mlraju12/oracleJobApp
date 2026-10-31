# Live source pilot

Date: 2026-10-30. Process: local in-memory app at http://localhost:3050. No applications were submitted and no employer was contacted.

## Supported employers and adapters

The registry has 15 catalog sources. Thirteen are enabled. Two are unsupported. This is not a claim that 15–25 separate employer career sites were each verified. Employers that appear only inside a Dice result were not given their own career-page adapter.

| Source | Adapter | Status | Last run | Hiring context | What was verified |
| --- | --- | --- | --- | --- | --- |
| Accenture Federal Services | Greenhouse Job Board API, token `accenturefederalservices` | enabled | complete | Consulting firm, direct employer | Public GET returned HTTP 200 on 2026-10-30. Docs: https://developers.greenhouse.io/job-board.html |
| Apex IT | Greenhouse `apexit` | enabled | complete | Consulting firm | Same public Greenhouse GET |
| Attain Partners | Greenhouse `attainpartners` | enabled | complete | Consulting firm | Same public Greenhouse GET. Career host `attainpartners.com` |
| DSP-Eclipsys | Greenhouse `eclipsyssolutions` | enabled | complete | Consulting firm | Board returned jobs. The sampled Fusion architect posting did not classify as Oracle Cloud HCM, so it stays off the default feed |
| M9 Solutions | Greenhouse `m9solutions` | enabled | complete | Consulting firm | Public board read completed. A complete run in this pilot fetched 0 Oracle HCM listings. Zero is a valid result |
| Pico | Greenhouse `picoquantitativetrading` | enabled | complete | Direct client | Pico’s own Oracle Fusion HCM analyst posting. Employer site recorded as pico.net |
| Sphere IT | Greenhouse `sphereit` | enabled | complete | Consulting firm | Same public Greenhouse GET |
| Highstreet IT | Lever Postings API, site `highstreetit` | enabled | complete | Consulting firm | Public JSON GET. Docs: https://github.com/lever/postings-api |
| NextOvation | Lever `nextovation` | enabled | complete | Consulting firm | Same public Lever GET |
| Deloitte | Public career search on apply.deloitte.com | enabled | partial | Consulting firm | First pages of the public HTML search. The run is partial, so absence does not close older Deloitte listings |
| EY | Public career search on careers.ey.com | enabled | partial | Consulting firm | Page cap. Partial run does not close listings |
| PwC | Public page on jobs-us.pwc.com | enabled | partial | Consulting firm | The first response did not include every hit. Workday CXS was not called |
| Dice | Public MCP `search_jobs` at https://mcp.dice.com/mcp | enabled | partial | Per posting: direct hire or recruiter | Docs: https://www.dice.com/about/mcp. One page per HCM keyword. More pages remain, so the scan is partial and does not close listings |
| KPMG | Public search | unsupported | never | Consulting firm | www.kpmguscareers.com HTML did not include a job list on 2026-10-30 |
| Accenture corporate | Public search | unsupported | never | Consulting firm | www.accenture.com job search HTML did not include listings on 2026-10-30. Federal jobs stay on the Greenhouse source |

Greenhouse application POST and Lever application POST are not implemented. Both need an employer secret this app does not have.

## Source-access evidence

- Greenhouse and Lever: unauthenticated public read of published posts, reviewed 2026-10-30. Terms status on those catalog rows is `public_read_documented`.
- Deloitte, EY, and PwC: public career-page HTML only. No partner API was assumed.
- Dice: unauthenticated MCP search. Dice’s own guide says to hand the candidate the job URL. `easyApply` is not stored and is not treated as permission to apply.
- URL import and the fetch helper reject localhost, link-local, private, and metadata addresses, strip credentials from URLs, and cap response size.
- Closure policy on each source defaults to `absent_after_complete_refresh`. A failed, partial, 403, timeout, or CAPTCHA run leaves listings active and marks presence unverified. `never_auto_close` is available on the source record.

## Pilot results

Collected in the local memory database before this note was written.

| Measure | Result |
| --- | --- |
| Catalog sources | 15 |
| Enabled | 13 |
| Unsupported | 2 |
| Failing | 0 |
| Active listings, all platforms | 293 |
| Active Oracle Cloud HCM or mixed | 105 |
| Employer names on those 105 | 55 |
| Direct-employer ownership on those 105 | 89 |
| Staffing-advertiser ownership on those 105 | 16 |
| Review queue | 18 listings |
| Review flags | conflicting employment type 14, low confidence 3, untrusted content 1 |
| Listings removed by absence | 0 in the sampled runs |

Sampled collection runs:

| Source shape | Status | Fetched | Created | Removed | Note |
| --- | --- | --- | --- | --- | --- |
| Dice | partial | 144 | 144 | 0 | More pages exist than the one-page cap |
| PwC | partial | 10 | 10 | 0 | First public page was incomplete |
| EY | partial | 25 | 25 | 0 | Page cap |
| Deloitte | partial | 22 | 22 | 0 | Page cap |
| One Greenhouse board | failed | 0 | 0 | 0 | Error text `terminated`. Listings were not closed |
| Accenture Federal and the smaller Greenhouse and Lever boards | complete | 4, 1, 8, 1, 4, 48, 3, 0, 23 across separate runs | same | 0 | The 0-fetched complete run is a valid empty Oracle HCM result |

Employers with an active Oracle Cloud HCM or mixed posting in this pilot included Deloitte (15), EY (10), Apex IT (9), IBM (6, via Dice), Accenture Federal Services (4), Apex Systems (3), Azusa Solutions (3), PwC (2), and Pico (1). IBM, Apex Systems, and the other Dice company names are the company printed on the Dice posting. They are not separate verified career-site adapters. Staffing advertisers stay labeled staffing. The end client is not inferred when the posting does not name one.

## Classification review

Checked against titles and excerpts stored from the original pages, not a second live browser pass on every one of the 105.

Retained with a clear Oracle Cloud HCM signal:

- Pico, Oracle Fusion Cloud HCM Analyst, with absence, time and labor, and fast formulas in the posting.
- Accenture Federal Services, Oracle Cloud HCM Fast Formula Developer.
- NextOvation, Oracle Fusion HCM Payroll/OTL consultant.
- Attain Partners, Oracle Cloud HCM Consulting Manager, posted date 2026-10-21 from Greenhouse.

Needs review, and was still in the cloud feed:

- EY title “Senior Consultant / Manager SAP SuccessFactors” matched because the description also contained Oracle HCM module words. The title itself is not an Oracle Cloud HCM role.
- EY “Fusion ERP Program and Project Management” matched on a short benefits or integrations excerpt. That is a weak HCM claim.
- EY Bangalore “PLATFORMS” consultant matched on a thin Core HR or talent excerpt. Location is outside the United States scope added in this sprint, so the default USA feed should leave it out when the location text names India.
- A Dice “Systems Engineer – Enterprise Storage” style title can inherit HCM phrases when Dice’s summary text is truncated or mixed. Those stay in review when the title and the Oracle phrase disagree.

Rejected on purpose:

- A bare “Oracle Cloud Security” infrastructure title is `unrelated_oracle` and stays off the default feed.
- “Systems include SAP, Workday, Oracle, and SuccessFactors” does not become Oracle Cloud HCM.
- EBS-only and PeopleSoft-only roles stay out of the default platform filter.

The relevance score is an explanation of where the Oracle Cloud HCM phrase appeared. It does not mean the job is still open or that the employer was verified beyond the source read.

## Coverage limitations

- KPMG US careers and Accenture’s corporate search do not publish a job list in the public HTML that this app can read.
- Most Oracle HCM customers post on Workday, Avature, or Oracle Career Site. No permitted public job API was verified for those, so they were not added.
- LinkedIn and Indeed do not offer a public job-search API this app may call.
- Greenhouse and Lever writes are partner or employer-key APIs. This app only reads.
- Deloitte, EY, and PwC reads are capped. A partial read must not be treated as the full vacancy list.
- Dice is capped at one page per keyword. Posted dates appear only when Dice or Greenhouse or Lever published one. EY, Deloitte, and PwC pages in this pilot often did not.
- The United States scope keeps a job when the location is unknown. It removes a job when the text names a non-US place, including remote jobs that state a non-US eligibility rule.
- The feed shows collected public listings only.

## Setup and worker

Local app, data discarded when the process stops:

```text
npm test
npm run dev
```

Open http://localhost:3050 and create an account. The default feed is Oracle Cloud HCM and mixed, active listings, and any geography.

Production web process:

```text
MONGODB_URI=... SESSION_SECRET=... npm start
```

Refresh worker, only when Redis is configured. BullMQ 6 is already installed. The worker polls enabled sources once a minute and enqueues one job id per source, `refresh-<source id>`, so the same source is not collected twice at once. The worker uses a 30 second stalled interval. Without `REDIS_URL`, refresh runs inside the web process instead.

```text
MONGODB_URI=... REDIS_URL=... npm run worker
```

Manual refresh of one source is rejected for 60 seconds after `lastRunAt` outside the test environment. A failed job retries with BullMQ exponential backoff when Redis is in use. `firstSeenAt` is set once. Content changes append to `changeLog` and keep the prior evidence object.

## Next blockers

1. KPMG and Accenture corporate still have no readable public job list.
2. Workday, Avature, and Oracle Career Site customers need a permitted read method before they can be added. Do not scrape them to raise the source count.
3. Deloitte, EY, and PwC need a documented complete-read method before a missing job can be marked removed.
4. Dice’s extra pages are unread. Raising the page cap increases load and still would not verify each Dice employer’s own career site.
5. The SAP SuccessFactors and Fusion ERP false positives need a tighter rule that a module word in a mixed-platform description is not enough when the title names a different product.
