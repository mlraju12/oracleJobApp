/**
 * One-shot read of documented public endpoints.
 * Writes counts and identifiers only. Does not store job descriptions.
 */
const fs = require('fs');
const path = require('path');

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'SLPMicrosystems-OracleHCMOpportunities/1.0',
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

function oracleTitles(jobs, titleOf) {
  return jobs
    .filter((job) => /oracle\s+(cloud\s+hcm|fusion\s+hcm|hcm\s+cloud)/i.test(titleOf(job)))
    .slice(0, 5)
    .map((job) => ({
      id: String(job.id),
      title: titleOf(job),
      url: job.absolute_url || job.hostedUrl || null,
    }));
}

async function main() {
  const greenhouse = await getJson('https://boards-api.greenhouse.io/v1/boards/accenturefederalservices/jobs');
  const jobs = greenhouse.json && Array.isArray(greenhouse.json.jobs) ? greenhouse.json.jobs : [];
  const reported = greenhouse.json && greenhouse.json.meta ? greenhouse.json.meta.total : null;
  const sample = oracleTitles(jobs, (job) => job.title || '');
  let detail = null;
  if (sample[0]) {
    const one = await getJson(`https://boards-api.greenhouse.io/v1/boards/accenturefederalservices/jobs/${sample[0].id}`);
    detail = {
      status: one.status,
      id: one.json && one.json.id,
      hasAbsoluteUrl: !!(one.json && one.json.absolute_url),
      hasFirstPublished: !!(one.json && one.json.first_published),
      hasContent: !!(one.json && one.json.content),
      hasPayInputRanges: !!(one.json && Array.isArray(one.json.pay_input_ranges)),
    };
  }
  const lever = await getJson('https://api.lever.co/v0/postings/leverdemo?mode=json&limit=1');
  const leverJobs = Array.isArray(lever.json) ? lever.json : [];
  const evidence = {
    checkedAt: new Date().toISOString(),
    greenhouse: {
      documentationUrl: 'https://developers.greenhouse.io/job-board.html',
      requestUrl: 'https://boards-api.greenhouse.io/v1/boards/accenturefederalservices/jobs',
      status: greenhouse.status,
      jobsArray: Array.isArray(greenhouse.json && greenhouse.json.jobs),
      reportedTotal: reported,
      fetched: jobs.length,
      countMatchesReportedTotal: reported != null && jobs.length === reported,
      oracleCloudHcmTitleCount: jobs.filter((job) => /oracle\s+(cloud\s+hcm|fusion\s+hcm|hcm\s+cloud)/i.test(job.title || '')).length,
      sampleTitles: sample,
      detailShape: detail,
      notes: 'Public GET of published posts for board token accenturefederalservices (Accenture Federal Services). Descriptions were not stored. Application POST was not called.',
    },
    lever: {
      documentationUrl: 'https://github.com/lever/postings-api',
      requestUrl: 'https://api.lever.co/v0/postings/leverdemo?mode=json&limit=1',
      status: lever.status,
      jsonArray: Array.isArray(lever.json),
      fetched: leverJobs.length,
      sampleKeys: leverJobs[0] ? ['id', 'text', 'hostedUrl', 'categories', 'workplaceType'].filter((key) => key in leverJobs[0]) : [],
      notes: 'leverdemo is Lever’s documented example site. It is not an Oracle HCM employer. Application POST was not called.',
    },
  };
  const target = path.join(__dirname, '..', 'docs', 'integration-evidence.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
