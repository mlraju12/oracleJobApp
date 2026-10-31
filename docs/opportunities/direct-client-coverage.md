# Direct end-client coverage

Checked 31 Oct 2026. This note records what the collectors actually monitor. Customer stories are discovery leads, not vacancies. No board identifier was generated from a company name.

## What is monitored

An adapter is a platform connector. A source is one employer board or one public search. Greenhouse being supported does not mean every Greenhouse employer is monitored.

Enabled catalog boards, from `PUBLIC_BOARDS` in `src/services/catalog.js`:

| Source | Adapter | Employer type on that board |
| --- | --- | --- |
| Pico (`picoquantitativetrading`) | Greenhouse Job Board API | End user, hiring its own team |
| Accenture Federal Services | Greenhouse Job Board API | Consulting firm, own team |
| M9 Solutions, Apex IT, Sphere IT | Greenhouse Job Board API | Consulting firm, own team (catalog default) |
| Attain Partners, DSP-Eclipsys | Greenhouse Job Board API | Consulting firm, own team |
| NextOvation, Highstreet IT | Lever Postings API | Consulting firm, own team |
| Deloitte, EY, PwC | Public career search page | Consulting firm, own team |
| Dice | Dice public job search | Unknown. One search, many employer names |

Unsupported catalog rows: KPMG US and Accenture corporate. Their public HTML did not include a job list on 30 Oct 2026.

Pico is the only catalogued end-user board. Dice “Direct Hire” sets hiring relationship to own team and leaves employer type unknown, so those rows do not pass the Direct end-client filter.

## How collection reads a posting

- Greenhouse boards of 80 jobs or fewer: the documented list with `content=true` is classified from the full description.
- Larger Greenhouse boards: the list has no description. A title and department gate selects candidates, then the single-job endpoint is called, up to 80 details. The gate now includes HRIS, HR technology, HR systems, business systems, payroll systems, enterprise applications, and HR applications. A role whose title matches none of those words is still not fetched on a large board. A truncated detail pass is partial and does not close listings.
- Lever: `skip`/`limit` until a short page. The posting JSON includes the description. Oracle wording is applied after the full text is read.
- Dice: keyword search, one page per keyword. The stored text is the Dice summary, not a separate employer career page. A short read stays partial.
- Deloitte, EY, and PwC: the public search page or its linked feed for an Oracle HCM query. PwC stays partial when the page count exceeds the embedded jobs. KPMG and Accenture corporate are unsupported.
- Ashby and SmartRecruiters adapters exist for boards whose identifier was read from a published URL. The Ashby response is one published list. SmartRecruiters uses `offset` until a short page or `totalFound`. Detail is fetched when the list omits the description. Consulting boards found on those platforms were not auto-enabled.
- Public JobPosting HTML is read only from structured data already in the page. `rel=next` stays on the same host. That adapter does not close listings, because one page is not a complete career-site snapshot.
- Oracle `recruitingCEJobRequisitions` is documented as internal use only (`https://docs.oracle.com/en/cloud/saas/human-resources/farws/api-recruiting-ce-job-requisitions.html`). It is not called. Workday CXS is not called.

## Relevance

Classification uses the title and the full description. The title does not have to say “Oracle Cloud HCM”.

- “Business Systems Analyst” with Oracle Cloud HCM, Core HR, Absence, and Time and Labor in the description stays Oracle Cloud HCM.
- A title that names SAP, SuccessFactors, NetSuite, or a generic database/ERP role is not kept as HCM because the description also mentions HCM.
- “Oracle Payroll” without Cloud, Fusion, or HCM, and an HRIS title that only says Oracle, stay out of the default feed and get an `ambiguous_oracle_hcm` review flag.
- EBS-only, PeopleSoft-only, and mixed stay separate platforms.

## Discovery batch

Web search is not configured. `DISCOVERY_SEARCH_ENDPOINT` and `DISCOVERY_SEARCH_KEY` are unset. `POST /api/discovery/search` returns that missing dependency. Official careers URLs can be imported. The import reads a Greenhouse, Lever, Ashby, or SmartRecruiters identifier from the page URL or a link on that page. It does not invent one.

The stored batch has 38 end-user candidates, not 50. Adding names to reach 50 would have been fabrication.

- Supported end-user board: Pico.
- Verified but unsupported: Intel (Workday redirect recorded 30 Oct 2026), Oracle’s own career site (internal-use API).
- Unresolved: the other career homes and Oracle customer stories. Those stories are leads. No vacancy was inferred.
- Supported consulting boards, not auto-enabled: ArcLight (Ashby `arclight-consulting`), Nagarro (`Nagarro1`), SpikeIT (`SpikeITGlobalSolutionsInc`), Sierra-Cedar (`Sierra-Cedar1`), NCS Australia (`NCSAustralia`), International Business Solutions Consult (`InternationalBusinessSolutionsConsult`). Identifiers are path segments of published job URLs.

## Direct end-client filter

`directEndClient=true` requires `employerType=end_user` and `hiringRelationship=own_team`. Manual classification corrections remain on `POST /api/opportunities/:id/classification`.

## Collection safety

With Redis, catalog refresh and employer-board resolution are queued for the worker. Without Redis, the same work runs in the web process, which is the existing local mode. A failed or partial refresh does not apply the absence policy. HTTP 200 is not treated as an open application. Imported URLs and redirects are checked for private, link-local, and credentialed targets.
