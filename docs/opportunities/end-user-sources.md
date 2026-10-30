# Additional end-user career sources

Checked 30 Oct 2026. Twenty-four employer names were tested against the public Greenhouse Job Board API (`GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs`) and six of those names were also tested against the public Lever Postings API (`GET https://api.lever.co/v0/postings/{site}?mode=json`). Every token returned HTTP 404. No Oracle Cloud HCM jobs were available to add.

The same employers’ public career home pages were requested. A home page is not a job list. This app does not scrape those pages and does not call Workday, Avature, or Oracle Career Site search.

| Employer | Greenhouse or Lever | Career home result | Why it was not added |
| --- | --- | --- | --- |
| UnitedHealth Group | Greenhouse 404 | careers.unitedhealthgroup.com HTTP 200 | No public Greenhouse board. Career host has no documented job-list API in this app. |
| Optum | Greenhouse 404, Lever 404 | www.optum.com HTTP 200 | Same. |
| Elevance Health | Greenhouse 404 | careers.elevancehealth.com HTTP 200 | Same. |
| Humana | Greenhouse 404 | careers.humana.com HTTP 200 | Same. |
| Kaiser Permanente | Greenhouse 404 | www.kaiserpermanentejobs.org HTTP 200 | Same. |
| CVS Health | Greenhouse 404 | jobs.cvshealth.com HTTP 200 | Same. |
| Walgreens | Greenhouse 404 | jobs.walgreens.com HTTP 200 | Same. |
| Pfizer | Greenhouse 404 | www.pfizer.com HTTP 403 | No public Greenhouse board. Career page refused the request. |
| Merck | Greenhouse 404 | jobs.merck.com HTTP 200 | No public Greenhouse board. |
| Johnson & Johnson | Greenhouse 404 | Redirected to www.careers.jnj.com HTTP 200 | No public Greenhouse board. |
| PepsiCo | Greenhouse 404 | www.pepsicojobs.com HTTP 200 | No public Greenhouse board. |
| Nike | Greenhouse 404 | careers.nike.com HTTP 200 | No public Greenhouse board. |
| Starbucks | Greenhouse 404 | careers.starbucks.com HTTP 200 | No public Greenhouse board. |
| Target | Greenhouse 404 | corporate.target.com HTTP 200 | No public Greenhouse board. |
| FedEx | Greenhouse 404 | careers.fedex.com HTTP 200 | No public Greenhouse board. |
| UPS | Greenhouse 404 | www.jobs-ups.com HTTP 200 | No public Greenhouse board. |
| Cisco | Greenhouse 404, Lever 404 | careers.cisco.com HTTP 200 | No public Greenhouse or Lever board. |
| Intel | Greenhouse 404 | Redirected to intel.wd1.myworkdayjobs.com HTTP 200 | Workday career site. This app does not call Workday CXS. |
| Oracle | Greenhouse 404, Lever 404 | careers.oracle.com HTTP 200 | Oracle’s own career site. No public Greenhouse or Lever board. This app does not call Oracle Career Site search. |
| NetJets | Greenhouse 404, Lever 404 | www.netjets.com HTTP 200 | No public Greenhouse or Lever board. Individual NetJets postings can still appear from Dice. |
| AutoZone | Greenhouse 404, Lever 404 | careers.autozone.com HTTP 200 | No public Greenhouse or Lever board. Individual AutoZone postings can still appear from Dice. |
| Boeing | Greenhouse 404 | jobs.boeing.com HTTP 200 | No public Greenhouse board. |
| Honeywell | Greenhouse 404 | careers.honeywell.com HTTP 200 | No public Greenhouse board. |
| Delta Dental of Illinois | Greenhouse 404 | www.deltadentalil.com/careers/ HTTP 404 | No public Greenhouse board, and that careers path was not found. Individual postings can still appear from Dice. |

No new employer board was added. Pico remains the catalogued end-user board with a public Greenhouse API. Dice remains the public search that can surface other end-user names without turning each name into its own career-site adapter.
