# Count reconciliation and listing-quality audit

Reviewed 30 Oct 2026 against the local memory database before the classification change was loaded.

## What “active” means

A listing is source-listed active when `listingStatus` is `active` and `applicationOpen` is `listed_by_source`. That means the employer’s own job list included the requisition. A page that returns HTTP 200 is not treated as verified open. An HTTP-only import stays `applicationOpen: not_established`.

Posted date, first discovered (`firstSeenAt`), last seen (`lastSeenAt`), and last verified (`lastCheckedAt`, also shown as `lastVerifiedAt`) are separate fields. A missing posted date stays unknown.

## Counts before the classification change

These numbers are one recount of the same local database. The default feed request returned 105. A full non-synthetic recount a few minutes earlier was 298 rows, of which 297 were source-listed active. The three-row difference is collection still writing, not a second population.

Exclusive split of the 297 source-listed active rows from that recount:

| Bucket | Count |
| --- | --- |
| Oracle Cloud HCM | 100 |
| Mixed Cloud with EBS or PeopleSoft | 2 |
| Other Oracle products (EBS or PeopleSoft only) | 14 |
| Not Cloud HCM (`unrelated_oracle` 180, `unrelated` 1) | 181 |
| Not source-listed (one removed after a complete scan) | 1, outside the 297 |

100 + 2 + 14 + 181 = 297. 297 + 1 = 298 monitored listings.

No stored row is removed because it duplicates another title. Same employer and source job ID update one row. Same URL with a different requisition ID stays as its own listing and is flagged. That flag is not subtracted from the total.

The phrase “15 sources” means 15 configured employer career boards and public searches: 13 enabled and 2 unsupported. They use 4 adapters: Greenhouse, Lever, public career search, and Dice. Dice is one board that returns many employer names.

## Audit sample

28 active Oracle Cloud HCM or mixed listings were read across PwC, EY, Deloitte, IBM, and Dice employers including Azusa Solutions, Sunrise Systems, AI ASAP, Calance, Oraapps, NetJets, Digitech Services, Ledgent Technology, Delta Dental of Illinois, Search Tactics, Argano, HyrUS, BCforward, SolutionIT, Tidal Impact, Cloud Destinations, Teamware Solutions, and Apex Systems.

Findings:

- Original URLs were present. Requisition IDs came from the source job ID (PwC `695924WD` and `753664WD`, EY numeric IDs, Deloitte JobDetail IDs, Dice GUIDs).
- PwC, EY, and Deloitte did not publish a posted date in the fields this app reads. Those dates stay unknown. Dice `postedDate` values were kept, including IBM 2026-09-26.
- Applications are “listed by the source,” not verified by HTTP 200.
- PwC and EY locations were empty even when the posting URL contains a city. PwC’s Workday path publishes the location (`TX-Dallas`, `GA-Atlanta`), and that path is now stored. EY and Deloitte still have no structured location in the fields we read, so those locations stay unknown.
- Titles that say Remote were sometimes stored as workplace unknown because only the description was checked. The title is now included.
- “Full-time” from Dice does not become an employee relationship unless the text says permanent, salaried, regular employee, or W-2. Contract stays a contractor and does not become part-time.
- Two Ledgent “Sr Oracle Cloud HCM Analyst” rows have different Dice IDs and different cities (San Dimas and Irvine). They stay separate.
- Dice “Direct Hire” does not say whether the company is an end user or a consulting firm, so employer type stays unknown. Dice “Recruiter” stays a staffing agency with an unknown hiring relationship. No end client is invented.
- Hours were not stated on the sampled rows, so hours stay unknown.

## Classification fix

A title that names a different product (SAP SuccessFactors, ERP, EPM, SCM, storage, OCM, training, or platforms) and does not name an HCM role is no longer kept as Oracle Cloud HCM because the description mentions HCM. The sampled EY SuccessFactors title and the Deloitte OCM and training titles were in the cloud feed for that reason. New collection uses the tighter rule. Existing memory rows change only after the process reloads and the boards are read again.
