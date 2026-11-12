const { canonicalUrl } = require('./text');
const { fetchJson, SourceFetchError } = require('./publicFetch');

const API_HOST = /^[a-z0-9-]+\.fa\.[a-z0-9]+\.oraclecloud\.com$/;
const SITE_NUMBER = /^CX(?:_[0-9]{1,6})?$/;
const JOB_ID = /^[0-9]{1,20}$/;

const WORKPLACE = {
  ORA_REMOTE: 'Remote',
  ORA_HYBRID: 'Hybrid',
  ORA_ON_SITE: 'On-site',
};

function careerTarget(source) {
  const config = (source && source.adapterConfig) || {};
  const apiHost = String(config.apiHost || '').trim().toLowerCase();
  const siteNumber = String(config.siteNumber || '').trim();
  const siteUrl = String(config.siteUrl || '').trim();
  if (!API_HOST.test(apiHost)) {
    throw new SourceFetchError('Oracle Candidate Experience host is missing or is not a public career host.', { retryable: false });
  }
  if (!SITE_NUMBER.test(siteNumber)) {
    throw new SourceFetchError('Oracle Candidate Experience site number is missing. It has to come from the public career URL.', { retryable: false });
  }
  let parsed;
  try {
    parsed = new URL(siteUrl);
  } catch {
    throw new SourceFetchError('Oracle Candidate Experience site URL is missing.', { retryable: false });
  }
  if (parsed.protocol !== 'https:') {
    throw new SourceFetchError('Oracle Candidate Experience site URL must be https.', { retryable: false });
  }
  return { apiHost, siteNumber, siteUrl: parsed.toString().replace(/\/$/, '') };
}

function requisitionSearchUrl(apiHost, siteNumber, limit, offset) {
  const finder = `findReqs;siteNumber=${siteNumber},limit=${limit},offset=${offset},sortBy=POSTING_DATES_DESC`;
  return `https://${apiHost}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=${finder}`;
}

function locationName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  return String(value.Name || value.LocationName || value.PrimaryLocation || value.GeographyName || value.DisplayName || '').trim();
}

function mapRequisition(job, siteUrl) {
  const id = job && job.Id != null ? String(job.Id).trim() : '';
  if (!JOB_ID.test(id)) return null;
  const root = String(siteUrl || '').replace(/\/+$/, '').replace(/\/jobs$/i, '');
  const locations = [];
  const primary = locationName(job.PrimaryLocation);
  if (primary) {
    locations.push({
      label: primary,
      country: job.PrimaryLocationCountry ? String(job.PrimaryLocationCountry) : null,
    });
  }
  const extra = Array.isArray(job.secondaryLocations) ? job.secondaryLocations : [];
  for (const item of extra) {
    const label = locationName(item);
    if (label && !locations.some((row) => row.label === label)) locations.push({ label });
  }
  const place = WORKPLACE[job.WorkplaceTypeCode] || '';
  if (place) locations.push({ label: place });
  let publishedAt = null;
  if (job.PostedDate) {
    const parsed = new Date(job.PostedDate);
    if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
  }
  return {
    sourceJobId: id,
    requisitionId: id,
    canonicalUrl: canonicalUrl(`${root}/job/${id}`),
    title: job.Title || '',
    descriptionText: job.ShortDescriptionStr || '',
    locations,
    publishedAt,
  };
}

function pageHead(json) {
  const items = json && Array.isArray(json.items) ? json.items : null;
  const head = items && items[0];
  if (!head || !Array.isArray(head.requisitionList)) return null;
  return head;
}

async function collectOracleCandidateExperience(source, deps = {}) {
  const { apiHost, siteNumber, siteUrl } = careerTarget(source);
  const limit = Math.min(Math.max(Number(deps.pageLimit) || 200, 1), 200);
  const maxPages = Math.min(Math.max(Number(deps.maxPages) || 15, 1), 20);
  const pauseMs = deps.minIntervalMs != null
    ? deps.minIntervalMs
    : ((source.adapterConfig && source.adapterConfig.minIntervalMs) || 400);
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const listings = [];
  let pages = 0;
  let requests = 0;
  let offset = 0;
  let total = null;
  let error = '';
  let shortPage = false;

  while (pages < maxPages) {
    if (pages > 0 && pauseMs) await sleep(pauseMs);
    let response;
    try {
      response = await fetchJson(requisitionSearchUrl(apiHost, siteNumber, limit, offset), {
        ...deps,
        allowedHosts: [apiHost],
      });
    } catch (err) {
      if (pages === 0) throw err;
      error = err.message;
      break;
    }
    requests += 1;
    pages += 1;
    const head = pageHead(response.json);
    if (!head) {
      error = 'Oracle Candidate Experience response did not include a requisition list.';
      break;
    }
    if (total == null && Number.isFinite(Number(head.TotalJobsCount))) total = Number(head.TotalJobsCount);
    for (const row of head.requisitionList) {
      const mapped = mapRequisition(row, siteUrl);
      if (mapped) listings.push(mapped);
    }
    if (head.requisitionList.length < limit) {
      shortPage = true;
      break;
    }
    offset += limit;
    if (total != null && listings.length >= total) {
      shortPage = true;
      break;
    }
  }

  const seen = new Set();
  const unique = [];
  for (const job of listings) {
    if (seen.has(job.sourceJobId)) continue;
    seen.add(job.sourceJobId);
    unique.push(job);
  }
  const complete = !error && shortPage && total != null && unique.length === total;
  return {
    listings: unique,
    complete,
    applyAbsencePolicy: complete,
    pages,
    requests,
    warnings: [],
    error,
    completeness: {
      kind: 'oracle.candidate-experience',
      reported: total,
      fetched: unique.length,
      verified: complete,
    },
  };
}

module.exports = {
  collectOracleCandidateExperience,
  mapRequisition,
  requisitionSearchUrl,
  careerTarget,
};
