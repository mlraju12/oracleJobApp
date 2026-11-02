const { canonicalUrl, htmlToText } = require('./text');
const { compensationFromStructured } = require('./extract');
const { classifyOracleHcm } = require('./classify');
const { fetchJson, SourceFetchError } = require('./publicFetch');

const PERIOD_WORDS = {
  annual: 'per year',
  yearly: 'per year',
  year: 'per year',
  monthly: 'per month',
  weekly: 'per week',
  hourly: 'per hour',
  daily: 'per day',
};

function publishedDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function payFrom(min, max, currency, period) {
  const hasMin = min != null && min !== '' && Number.isFinite(Number(min));
  const hasMax = max != null && max !== '' && Number.isFinite(Number(max));
  if (!hasMin && !hasMax) return null;
  return compensationFromStructured({
    min: hasMin ? Number(min) : null,
    max: hasMax ? Number(max) : null,
    currency: currency || '',
    interval: PERIOD_WORDS[String(period || '').toLowerCase()] || '',
  });
}

function safeUrl(value) {
  try {
    return value ? canonicalUrl(value) : null;
  } catch {
    return null;
  }
}

function keepRelevant(mapped) {
  if (!mapped || !mapped.sourceJobId) return false;
  const platform = classifyOracleHcm({ title: mapped.title, description: mapped.descriptionText }).platform;
  return platform !== 'unrelated';
}

function mapHimalayasJob(job) {
  const url = safeUrl(job.applicationLink || job.guid);
  const sourceJobId = String(job.guid || url || '');
  const locations = Array.isArray(job.locationRestrictions)
    ? job.locationRestrictions.filter(Boolean).map((label) => ({ label: String(label) }))
    : [];
  return {
    sourceJobId,
    canonicalUrl: url,
    title: job.title || '',
    descriptionText: htmlToText(job.description || job.excerpt || ''),
    employmentType: job.employmentType || null,
    locations,
    publishedAt: publishedDate(job.pubDate),
    compensation: payFrom(job.minSalary, job.maxSalary, job.currency, job.salaryPeriod),
    employerName: job.companyName || '',
    hiringContext: 'unknown',
    sourceOwnership: 'unknown',
    employerType: 'unknown',
    hiringRelationship: 'unknown',
    classificationEvidence: 'Himalayas published this posting and named the company. That does not establish whether the company is an end user or a consulting firm.',
    verificationBasis: 'source_job_list',
  };
}

function mapJobicyJob(job) {
  const employment = Array.isArray(job.jobType) ? (job.jobType.length === 1 ? job.jobType[0] : null) : job.jobType;
  return {
    sourceJobId: job.id == null ? '' : String(job.id),
    canonicalUrl: safeUrl(job.url),
    title: job.jobTitle || '',
    descriptionText: htmlToText(job.jobDescription || job.jobExcerpt || ''),
    employmentType: employment || null,
    locations: job.jobGeo ? [{ label: String(job.jobGeo) }] : [],
    publishedAt: publishedDate(job.pubDate),
    compensation: null,
    employerName: job.companyName || '',
    hiringContext: 'unknown',
    sourceOwnership: 'unknown',
    employerType: 'unknown',
    hiringRelationship: 'unknown',
    classificationEvidence: 'Jobicy published this posting and named the company. That does not establish whether the company is an end user or a consulting firm.',
    verificationBasis: 'source_job_list',
  };
}

function incomplete(message, extra = {}) {
  return {
    listings: extra.listings || [],
    complete: false,
    applyAbsencePolicy: false,
    pages: extra.pages || 0,
    requests: extra.requests || 0,
    warnings: extra.warnings || [],
    error: message || '',
    completeness: extra.completeness || null,
  };
}

async function readJson(url, deps, allowedHosts) {
  return fetchJson(url, {
    ...deps,
    allowedHosts,
    retries: deps.retries != null ? deps.retries : 1,
  });
}

async function collectHimalayas(source, deps) {
  const config = source.adapterConfig || {};
  const queries = Array.isArray(config.queries) && config.queries.length
    ? config.queries
    : [config.query || 'Oracle HCM'];
  const maxPages = deps.maxPages || config.maxPages || 15;
  const pause = deps.minIntervalMs != null ? deps.minIntervalMs : (config.minIntervalMs != null ? config.minIntervalMs : 400);
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const seen = new Map();
  let requests = 0;
  let raw = 0;
  let finished = true;
  let truncated = false;
  let total = 0;

  for (const query of queries) {
  let page = 1;
  let queryFinished = false;
  let queryTotal = null;
  while (page <= maxPages) {
    if (requests && pause) await sleep(pause);
    let response;
    try {
      response = await readJson(
        `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(query)}&limit=20&page=${page}`,
        deps,
        ['himalayas.app']
      );
    } catch (error) {
      return incomplete(error.message, { pages: page, requests, listings: [...seen.values()] });
    }
    requests += 1;
    const body = response.json || {};
    const jobs = body.jobs;
    if (!Array.isArray(jobs)) {
      return incomplete('Himalayas did not return a job list.', {
        pages: page,
        requests,
        listings: [...seen.values()],
      });
    }
    if (Number.isFinite(Number(body.totalCount))) queryTotal = Number(body.totalCount);
    raw += jobs.length;
    for (const job of jobs) {
      const mapped = mapHimalayasJob(job);
      if (!keepRelevant(mapped) || seen.has(mapped.sourceJobId)) continue;
      seen.set(mapped.sourceJobId, mapped);
    }
    const offset = Number(body.offset);
    const covered = Number.isFinite(offset) ? offset + jobs.length : page * jobs.length;
    if (jobs.length === 0 || (queryTotal != null && covered >= queryTotal) || (queryTotal == null && jobs.length < 20)) {
      queryFinished = true;
      break;
    }
    if (page >= maxPages) {
      truncated = true;
      break;
    }
    page += 1;
  }
  if (queryTotal != null) total += queryTotal;
  if (!queryFinished) finished = false;
  }

  return {
    listings: [...seen.values()],
    complete: finished && !truncated,
    applyAbsencePolicy: finished && !truncated,
    pages: requests,
    requests,
    warnings: truncated ? ['Himalayas reported more results than this refresh read.'] : [],
    error: '',
    completeness: { kind: 'himalayas.search', fetched: raw, total, pages: requests, verified: finished && !truncated },
  };
}

async function collectJobicy(source, deps) {
  const config = source.adapterConfig || {};
  const tag = config.tag || 'oracle';
  let response;
  try {
    response = await readJson(
      `https://jobicy.com/api/v2/remote-jobs?tag=${encodeURIComponent(tag)}&count=50`,
      deps,
      ['jobicy.com', 'jobi.cy']
    );
  } catch (error) {
    return incomplete(error.message, { pages: 1, requests: 1 });
  }
  const body = response.json || {};
  const jobs = body.jobs;
  if (!Array.isArray(jobs)) {
    return incomplete('Jobicy did not return a job list.', { pages: 1, requests: 1 });
  }
  const seen = new Map();
  for (const job of jobs) {
    const mapped = mapJobicyJob(job);
    if (!keepRelevant(mapped) || seen.has(mapped.sourceJobId)) continue;
    seen.set(mapped.sourceJobId, mapped);
  }
  const more = body.hasMore === true;
  return {
    listings: [...seen.values()],
    complete: !more,
    applyAbsencePolicy: !more,
    pages: 1,
    requests: 1,
    warnings: more ? ['Jobicy reported more jobs than this response included.'] : [],
    error: '',
    completeness: { kind: 'jobicy.remote-jobs', fetched: jobs.length, verified: !more },
  };
}

async function collectPublicJobFeed(source, deps = {}) {
  const provider = source.adapterConfig && source.adapterConfig.provider;
  if (provider === 'himalayas') return collectHimalayas(source, deps);
  if (provider === 'jobicy') return collectJobicy(source, deps);
  throw new SourceFetchError('Public job feed provider is not one of the documented boards.', { retryable: false });
}

module.exports = {
  collectPublicJobFeed,
  mapHimalayasJob,
  mapJobicyJob,
};
