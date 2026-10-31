const { canonicalUrl, htmlToText, sha256 } = require('./text');
const { compensationFromStructured } = require('./extract');
const { classifyOracleHcm } = require('./classify');
const { fetchJson, fetchPublic, SourceFetchError } = require('./publicFetch');

const GREENHOUSE_API = 'boards-api.greenhouse.io';
const LEVER_HOSTS = {
  global: 'api.lever.co',
  eu: 'api.eu.lever.co',
};

const ADAPTERS = [
  {
    id: 'greenhouse-job-board',
    label: 'Greenhouse Job Board API',
    verified: true,
    documentationUrl: 'https://developers.greenhouse.io/job-board.html',
    accessMethod: 'public_api',
    summary: 'Public GET of published job posts. No API key. The jobs list is documented as the full set plus meta.total. Application POST is not implemented.',
    limitations: [
      'Checked against Greenhouse Job Board API docs on 2026-10-30. The jobs list has no documented page parameter; completeness is jobs.length compared with meta.total.',
      'first_published and pay_input_ranges are documented on the single-job endpoint. The list call with content=true supplies the description. Per-job enrichment is off unless the source enables fetchDetails.',
      'A 401 or 403 stops the adapter. It does not bypass login, CAPTCHA, or access controls.',
    ],
  },
  {
    id: 'lever-postings',
    label: 'Lever Postings API',
    verified: true,
    documentationUrl: 'https://github.com/lever/postings-api',
    accessMethod: 'public_api',
    summary: 'Public JSON GET of published postings using skip and limit. Application POST is not implemented.',
    limitations: [
      'Checked against the Lever Postings API README on 2026-10-30. Pagination is skip and limit. A short page ends a complete collection.',
      'The README describes the API as a way for a company to build its own job site. An administrator must record a terms review before a board can be enabled.',
      'Published-date is not a documented list field, so it stays unknown unless the posting text states one.',
      'Browser CORS limits do not apply to this server-side GET. Access-denied responses are not bypassed.',
    ],
  },
  {
    id: 'dice-mcp',
    label: 'Dice public job search',
    verified: true,
    documentationUrl: 'https://www.dice.com/about/mcp',
    accessMethod: 'public_api',
    summary: 'Public search of Dice technology jobs. No login. The response includes the posted date and a link to the Dice posting. This app does not submit the Dice application.',
    limitations: [
      'Checked against Dice MCP documentation on 2026-10-30. Endpoint https://mcp.dice.com/mcp, tool search_jobs, no authentication.',
      'Dice documents that the search hands back the application link. It does not accept an application from this app.',
      'A search can return more pages than one refresh reads. A short refresh stays partial and does not close listings that were not in that search.',
    ],
  },
  {
    id: 'ashby-job-board',
    label: 'Ashby Job Postings API',
    verified: true,
    documentationUrl: 'https://developers.ashbyhq.com/docs/public-job-posting-api',
    accessMethod: 'public_api',
    summary: 'Public GET of one employer’s published Ashby job board. No API key. Application POST is not implemented.',
    limitations: [
      'Checked against Ashby’s public job posting API on 2026-10-31. The board name is the last segment of the hosted jobs URL. The response is the published list, not a guessed company directory.',
      'Jobs with isListed false are left out. A missing jobs array is an incomplete read and does not close listings.',
    ],
  },
  {
    id: 'smartrecruiters-postings',
    label: 'SmartRecruiters Posting API',
    verified: true,
    documentationUrl: 'https://developers.smartrecruiters.com/docs/posting-api',
    accessMethod: 'public_api',
    summary: 'Public GET of one company’s public postings, with offset pagination and a detail GET when the list omits the description. Application POST is not implemented.',
    limitations: [
      'Checked against the SmartRecruiters Posting API on 2026-10-31. destination=PUBLIC is the public set. The company identifier comes from the published careers URL, not a guessed name.',
      'A short page or a totalFound that matches the rows fetched is a complete list. A page cap or a failed detail request stays partial and does not close listings.',
    ],
  },
  {
    id: 'public-structured',
    label: 'Public page JobPosting data',
    verified: true,
    documentationUrl: null,
    accessMethod: 'public_page',
    summary: 'Reads JobPosting structured data already present in the public HTML. It does not run a browser and does not call an undocumented jobs endpoint.',
    limitations: [
      'A page with no JobPosting data is unsupported for collection. rel=next is followed only on the same host.',
      'This adapter does not treat one HTML page as a complete career-site snapshot, so it does not close listings that were absent.',
    ],
  },
  {
    id: 'public-search',
    label: 'Public career search page',
    verified: true,
    documentationUrl: null,
    accessMethod: 'public_page',
    summary: 'Reads the job list the employer publishes on its own career search page or the feed linked from that page. Application forms are not submitted.',
    limitations: [
      'Checked on 2026-10-30 for Deloitte US, EY, and PwC US Oracle HCM search pages.',
      'KPMG US and Accenture’s main job search do not include the job list in the public page response.',
      'Greenhouse and Lever application POST endpoints require the employer’s secret API key, which this app does not have.',
    ],
  },
  {
    id: 'manual',
    label: 'Manual public URL',
    verified: true,
    documentationUrl: null,
    accessMethod: 'manual',
    summary: 'Administrator-entered public URL. Greenhouse and Lever job URLs use the documented read endpoints. Other pages are stored as text.',
    limitations: [
      'One URL is not a complete source snapshot, so manual import never closes other listings.',
      'Pages behind login or CAPTCHA are not collected.',
    ],
  },
  {
    id: 'fixture',
    label: 'Synthetic fixture',
    verified: false,
    documentationUrl: null,
    accessMethod: 'manual',
    summary: 'Labeled demo data. It is not a live employer feed.',
    limitations: ['Cannot be enabled for collection.'],
  },
];

function adapterById(id) {
  return ADAPTERS.find((adapter) => adapter.id === id) || null;
}

function boardToken(source) {
  const token = String((source.adapterConfig && source.adapterConfig.boardToken) || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(token)) {
    throw new SourceFetchError('Greenhouse board token is missing or not in the documented token shape.', { retryable: false });
  }
  return token;
}

function leverSite(source) {
  const site = String((source.adapterConfig && source.adapterConfig.site) || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(site)) {
    throw new SourceFetchError('Lever site name is missing or not in the documented site shape.', { retryable: false });
  }
  const region = (source.adapterConfig && source.adapterConfig.region) === 'eu' ? 'eu' : 'global';
  return { site, host: LEVER_HOSTS[region] };
}

function greenhouseLocations(job) {
  if (Array.isArray(job.offices) && job.offices.length) {
    return job.offices
      .filter((office) => office && (office.name || office.location))
      .map((office) => ({
        label: [office.name, office.location].filter(Boolean).join(', '),
        region: office.location || null,
      }));
  }
  if (job.location && job.location.name) return [{ label: job.location.name }];
  return [];
}

function mapGreenhouseJob(job) {
  const pay = Array.isArray(job.pay_input_ranges) && job.pay_input_ranges.length
    ? compensationFromStructured(job.pay_input_ranges[0])
    : null;
  let publishedAt = null;
  if (job.first_published) {
    const parsed = new Date(job.first_published);
    if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
  }
  return {
    sourceJobId: String(job.id),
    internalJobId: job.internal_job_id == null ? null : String(job.internal_job_id),
    requisitionId: job.requisition_id == null ? null : String(job.requisition_id),
    canonicalUrl: job.absolute_url ? canonicalUrl(job.absolute_url) : null,
    title: job.title || '',
    descriptionHtml: job.content || '',
    locations: greenhouseLocations(job),
    publishedAt,
    compensation: pay,
  };
}

function mapLeverJob(job) {
  const locations = [];
  const categories = job.categories || {};
  const all = Array.isArray(categories.allLocations) ? categories.allLocations : [];
  const names = all.length ? all : (categories.location ? [categories.location] : []);
  for (const name of names) {
    if (name) locations.push({ label: String(name) });
  }
  const salary = job.salaryRange && typeof job.salaryRange === 'object'
    ? compensationFromStructured({
      min: job.salaryRange.min,
      max: job.salaryRange.max,
      currency: job.salaryRange.currency,
      interval: job.salaryRange.interval,
    })
    : null;
  const description = [job.descriptionPlain, job.additionalPlain].filter(Boolean).join('\n\n');
  return {
    sourceJobId: String(job.id || ''),
    canonicalUrl: job.hostedUrl ? canonicalUrl(job.hostedUrl) : null,
    title: job.text || '',
    descriptionText: description,
    locations,
    compensation: salary,
    employmentType: categories.commitment || null,
  };
}

function relevantOracleListing(partial) {
  const description = partial.descriptionText || htmlToText(partial.descriptionHtml || '');
  return classifyOracleHcm({ title: partial.title || '', description }).platform !== 'unrelated';
}

function greenhouseCandidate(job) {
  const departments = Array.isArray(job.departments) ? job.departments.map((item) => item && item.name) : [];
  const blob = [job.title, ...departments].filter(Boolean).join(' ');
  return /\boracle\b|\bpeoplesoft\b|\bpeople\s*soft\b|\bfusion\b|\be-?business\b|\bhcm\b|\bfast formula|\bcore hr\b|\bhris\b|\bhr technology\b|\bhr systems?\b|\bbusiness systems?\b|\bpayroll systems?\b|\benterprise applications?\b|\bhr applications?\b|\bhuman resources information\b/i.test(blob);
}

async function greenhouseJobList(token, deps, withContent) {
  const listUrl = `https://${GREENHOUSE_API}/v1/boards/${encodeURIComponent(token)}/jobs${withContent ? '?content=true' : ''}`;
  const response = await fetchJson(listUrl, {
    ...deps,
    allowedHosts: [GREENHOUSE_API],
  });
  const jobs = response.json && response.json.jobs;
  if (!Array.isArray(jobs)) {
    throw new SourceFetchError('Greenhouse response did not include a jobs array.', { retryable: false });
  }
  const reported = response.json.meta && Number.isFinite(Number(response.json.meta.total))
    ? Number(response.json.meta.total)
    : null;
  return { jobs, reported };
}

async function collectGreenhouseOracle(source, deps, token) {
  const listed = await greenhouseJobList(token, deps, false);
  const listComplete = listed.reported !== null && listed.jobs.length === listed.reported;
  const pauseMs = deps.minIntervalMs != null
    ? deps.minIntervalMs
    : ((source.adapterConfig && source.adapterConfig.minIntervalMs) || 400);
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (listComplete && listed.jobs.length <= 80) {
    const full = await greenhouseJobList(token, deps, true);
    const complete = full.reported !== null && full.jobs.length === full.reported && full.jobs.length === listed.jobs.length;
    const listings = full.jobs.map(mapGreenhouseJob).filter(relevantOracleListing);
    return {
      listings,
      complete,
      applyAbsencePolicy: complete,
      pages: 1,
      requests: 2,
      warnings: [],
      completeness: {
        kind: 'greenhouse.meta.total',
        reported: full.reported,
        fetched: full.jobs.length,
        oracleListings: listings.length,
        verified: complete,
      },
    };
  }
  const candidates = listed.jobs.filter(greenhouseCandidate);
  const cap = deps.detailCap || 80;
  const selected = candidates.slice(0, cap);
  const listings = [];
  const warnings = [];
  let requests = 1;
  for (let index = 0; index < selected.length; index += 1) {
    const job = selected[index];
    if (index > 0 && pauseMs) await sleep(pauseMs);
    requests += 1;
    try {
      const detail = await fetchJson(`https://${GREENHOUSE_API}/v1/boards/${encodeURIComponent(token)}/jobs/${encodeURIComponent(job.id)}`, {
        ...deps,
        allowedHosts: [GREENHOUSE_API],
      });
      const mapped = mapGreenhouseJob({ ...job, ...(detail.json || {}) });
      if (relevantOracleListing(mapped)) listings.push(mapped);
    } catch (error) {
      warnings.push(error.message);
    }
  }
  const complete = listComplete && warnings.length === 0 && candidates.length <= cap;
  return {
    listings,
    complete,
    applyAbsencePolicy: complete,
    pages: 1,
    requests,
    warnings,
    error: warnings.length ? 'One or more job details could not be read.' : '',
    completeness: {
      kind: 'greenhouse.oracle_details',
      reported: listed.reported,
      fetched: listed.jobs.length,
      candidates: candidates.length,
      detailed: listings.length,
      verified: complete,
    },
  };
}

async function collectGreenhouse(source, deps) {
  const token = boardToken(source);
  const oracleOnly = !!(source.adapterConfig && source.adapterConfig.oracleOnly);
  if (oracleOnly) return collectGreenhouseOracle(source, deps, token);
  const listed = await greenhouseJobList(token, deps, true);
  const { jobs, reported } = listed;
  let listings = jobs.map(mapGreenhouseJob);
  const warnings = [];
  if (source.adapterConfig && source.adapterConfig.fetchDetails) {
    const pause = deps.minIntervalMs != null ? deps.minIntervalMs : (source.adapterConfig.minIntervalMs || 1000);
    const enriched = [];
    for (const job of jobs) {
      if (pause) await (deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(pause);
      try {
        const detail = await fetchJson(`https://${GREENHOUSE_API}/v1/boards/${encodeURIComponent(token)}/jobs/${encodeURIComponent(job.id)}`, {
          ...deps,
          allowedHosts: [GREENHOUSE_API],
        });
        enriched.push(mapGreenhouseJob({ ...job, ...detail.json }));
      } catch (error) {
        warnings.push(error.message);
        enriched.push(mapGreenhouseJob(job));
      }
    }
    listings = enriched;
  }
  const complete = reported !== null && jobs.length === reported;
  return {
    listings,
    complete,
    applyAbsencePolicy: complete,
    pages: 1,
    requests: 1 + (source.adapterConfig && source.adapterConfig.fetchDetails ? jobs.length : 0),
    warnings,
    completeness: {
      kind: 'greenhouse.meta.total',
      reported,
      fetched: jobs.length,
      verified: complete,
    },
  };
}

function finishLever(source, payload) {
  if (source.adapterConfig && source.adapterConfig.oracleOnly) {
    payload.listings = (payload.listings || []).filter(relevantOracleListing);
  }
  return payload;
}

async function collectLever(source, deps) {
  const { site, host } = leverSite(source);
  const limit = deps.pageLimit || 100;
  const maxPages = deps.maxPages || 100;
  const listings = [];
  let skip = 0;
  let pages = 0;
  let requests = 0;
  while (pages < maxPages) {
    if (pages > 0) {
      const pause = deps.minIntervalMs != null ? deps.minIntervalMs : ((source.adapterConfig && source.adapterConfig.minIntervalMs) || 500);
      if (pause) await (deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(pause);
    }
    const url = `https://${host}/v0/postings/${encodeURIComponent(site)}?mode=json&skip=${skip}&limit=${limit}`;
    let response;
    try {
      response = await fetchJson(url, { ...deps, allowedHosts: [host] });
    } catch (error) {
      return finishLever(source, {
        listings,
        complete: false,
        applyAbsencePolicy: false,
        pages,
        requests,
        error: error.message,
        completeness: { kind: 'lever.skip', fetched: listings.length, verified: false },
      });
    }
    requests += 1;
    pages += 1;
    const batch = response.json;
    if (!Array.isArray(batch)) {
      return finishLever(source, {
        listings,
        complete: false,
        applyAbsencePolicy: false,
        pages,
        requests,
        error: 'Lever response was not a JSON array.',
        completeness: { kind: 'lever.skip', fetched: listings.length, verified: false },
      });
    }
    listings.push(...batch.map(mapLeverJob).filter((job) => job.sourceJobId));
    if (batch.length < limit) {
      return finishLever(source, {
        listings,
        complete: true,
        applyAbsencePolicy: true,
        pages,
        requests,
        completeness: { kind: 'lever.skip', fetched: listings.length, limit, pages, verified: true },
      });
    }
    skip += batch.length;
  }
  return finishLever(source, {
    listings,
    complete: false,
    applyAbsencePolicy: false,
    pages,
    requests,
    error: 'Stopped at the page cap before Lever returned a short page.',
    completeness: { kind: 'lever.skip', fetched: listings.length, verified: false },
  });
}

function parseKnownJobUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if ((host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') && parts[1] === 'jobs' && /^\d+$/.test(parts[2] || '')) {
    return { adapter: 'greenhouse-job-board', boardToken: parts[0], jobId: parts[2] };
  }
  if ((host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') && parts[0] && parts[1]) {
    return { adapter: 'lever-postings', site: parts[0], jobId: parts[1], region: host.startsWith('jobs.eu.') ? 'eu' : 'global' };
  }
  return null;
}

async function importPublicUrl(rawUrl, deps) {
  const known = parseKnownJobUrl(rawUrl);
  if (known && known.adapter === 'greenhouse-job-board') {
    const response = await fetchJson(`https://${GREENHOUSE_API}/v1/boards/${encodeURIComponent(known.boardToken)}/jobs/${encodeURIComponent(known.jobId)}`, {
      ...deps,
      allowedHosts: [GREENHOUSE_API],
    });
    return mapGreenhouseJob(response.json || {});
  }
  if (known && known.adapter === 'lever-postings') {
    const host = LEVER_HOSTS[known.region];
    const response = await fetchJson(`https://${host}/v0/postings/${encodeURIComponent(known.site)}/${encodeURIComponent(known.jobId)}?mode=json`, {
      ...deps,
      allowedHosts: [host],
    });
    return mapLeverJob(response.json || {});
  }
  const response = await fetchPublic(rawUrl, { ...deps, accept: 'text/html, application/json;q=0.5', maxBytes: 2_000_000 });
  const html = response.body || '';
  const structured = jsonLdJob(html);
  const title = structured.title || metaContent(html, 'og:title') || tagText(html, 'title') || 'Untitled posting';
  const descriptionHtml = structured.description || html;
  return {
    sourceJobId: structured.identifier || `manual:${sha256(canonicalUrl(response.url)).slice(0, 24)}`,
    canonicalUrl: canonicalUrl(response.url),
    title,
    descriptionText: structured.description ? htmlToText(structured.description) : htmlToText(html),
    descriptionHtml: descriptionHtml,
    verificationBasis: 'http_response_only',
    locations: structured.locations,
    publishedAt: structured.publishedAt,
    employmentType: structured.employmentType,
    compensation: structured.compensation,
  };
}

function metaContent(html, property) {
  const match = String(html || '').match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || String(html || '').match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'));
  return match ? match[1] : '';
}

function tagText(html, tag) {
  const match = String(html || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? htmlToText(match[1]) : '';
}

function jsonLdJob(html) {
  const jobs = jsonLdJobs(html);
  const job = jobs[0];
  if (!job) return {};
  const mapped = mapJsonLdJob(job, '');
  let compensation = null;
  const salary = job.baseSalary && (job.baseSalary.value || job.baseSalary);
  if (salary && typeof salary === 'object' && (salary.minValue != null || salary.value != null || salary.maxValue != null)) {
    compensation = compensationFromStructured({
      min: Number(salary.minValue != null ? salary.minValue : salary.value),
      max: salary.maxValue != null ? Number(salary.maxValue) : null,
      currency: job.baseSalary.currency,
      interval: salary.unitText,
    });
  }
  return {
    title: mapped.title,
    description: typeof job.description === 'string' ? job.description : '',
    employmentType: mapped.employmentType,
    identifier: job.identifier && typeof job.identifier.value === 'string' ? job.identifier.value : null,
    locations: mapped.locations,
    publishedAt: mapped.publishedAt,
    compensation,
  };
}

const ASHBY_HOST = 'api.ashbyhq.com';
const SMARTRECRUITERS_HOST = 'api.smartrecruiters.com';

function uniqueListings(listings) {
  const seen = new Set();
  return (listings || []).filter((job) => {
    if (!job || !job.sourceJobId || seen.has(job.sourceJobId)) return false;
    seen.add(job.sourceJobId);
    return true;
  });
}

function boardName(source, field) {
  const value = String((source.adapterConfig && source.adapterConfig[field]) || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(value)) {
    throw new SourceFetchError(`${field} is missing or not in the documented identifier shape.`, { retryable: false });
  }
  return value;
}

async function collectAshby(source, deps) {
  const name = boardName(source, 'boardName');
  const response = await fetchJson(`https://${ASHBY_HOST}/posting-api/job-board/${encodeURIComponent(name)}?includeCompensation=true`, {
    ...deps,
    allowedHosts: [ASHBY_HOST],
  });
  const jobs = response.json && response.json.jobs;
  if (!Array.isArray(jobs)) {
    return {
      listings: [],
      complete: false,
      applyAbsencePolicy: false,
      pages: 1,
      requests: 1,
      error: 'Ashby response did not include a jobs array.',
      completeness: { kind: 'ashby.job-board', verified: false },
    };
  }
  const listings = jobs.filter((job) => job && job.isListed !== false).map(mapAshbyJob).filter((job) => job.sourceJobId);
  const kept = source.adapterConfig && source.adapterConfig.oracleOnly ? listings.filter(relevantOracleListing) : listings;
  return {
    listings: uniqueListings(kept),
    complete: true,
    applyAbsencePolicy: true,
    pages: 1,
    requests: 1,
    warnings: [],
    completeness: {
      kind: 'ashby.job-board',
      fetched: jobs.length,
      listed: listings.length,
      oracleListings: kept.length,
      verified: true,
    },
  };
}

function mapAshbyJob(job) {
  const address = job.address && job.address.postalAddress ? job.address.postalAddress : {};
  const label = [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(', ') || job.location || '';
  const workplace = job.workplaceType === 'Remote' ? 'Remote' : (job.workplaceType === 'Hybrid' ? 'Hybrid' : (job.workplaceType === 'OnSite' ? 'On-site' : ''));
  const locations = [];
  if (label) locations.push({ label: String(label), locality: address.addressLocality || null, region: address.addressRegion || null, country: address.addressCountry || null });
  if (workplace) locations.push({ label: workplace });
  let publishedAt = null;
  if (job.publishedAt) {
    const parsed = new Date(job.publishedAt);
    if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
  }
  const employment = {
    FullTime: 'FULL_TIME',
    PartTime: 'PART_TIME',
    Contract: 'CONTRACT',
    Temporary: 'TEMPORARY',
  }[job.employmentType] || null;
  return {
    sourceJobId: String(job.id || job.jobUrl || ''),
    canonicalUrl: job.jobUrl ? canonicalUrl(job.jobUrl) : null,
    title: job.title || '',
    descriptionText: job.descriptionPlain || '',
    descriptionHtml: job.descriptionHtml || '',
    locations,
    publishedAt,
    employmentType: employment,
    compensation: job.compensation ? compensationFromStructured(job.compensation) : null,
  };
}

function smartRecruitersText(posting) {
  const ad = posting && posting.jobAd;
  if (!ad) return '';
  const sections = Array.isArray(ad.sections) ? ad.sections.map((section) => section && (section.text || section.title)).filter(Boolean) : [];
  return [ad.title, ...sections].join('\n');
}

function mapSmartRecruitersJob(posting) {
  const location = posting.location || {};
  const label = [location.city, location.region, location.country, location.remote ? 'Remote' : ''].filter(Boolean).join(', ');
  let publishedAt = null;
  if (posting.releasedDate) {
    const parsed = new Date(posting.releasedDate);
    if (!Number.isNaN(parsed.getTime())) publishedAt = parsed;
  }
  const employment = posting.typeOfEmployment && (posting.typeOfEmployment.label || posting.typeOfEmployment.id);
  return {
    sourceJobId: String(posting.id || posting.uuid || ''),
    canonicalUrl: posting.postingUrl || posting.applyUrl ? canonicalUrl(posting.postingUrl || posting.applyUrl) : null,
    title: posting.name || (posting.jobAd && posting.jobAd.title) || '',
    descriptionText: smartRecruitersText(posting),
    locations: label ? [{ label, locality: location.city || null, region: location.region || null, country: location.country || null }] : [],
    publishedAt,
    employmentType: employment || null,
  };
}

async function collectSmartRecruiters(source, deps) {
  const company = boardName(source, 'companyIdentifier');
  const limit = Math.min(deps.pageLimit || 100, 100);
  const maxPages = deps.maxPages || 100;
  const pauseMs = deps.minIntervalMs != null ? deps.minIntervalMs : ((source.adapterConfig && source.adapterConfig.minIntervalMs) || 400);
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const rows = [];
  let offset = 0;
  let pages = 0;
  let requests = 0;
  let totalFound = null;
  while (pages < maxPages) {
    if (pages > 0 && pauseMs) await sleep(pauseMs);
    const url = `https://${SMARTRECRUITERS_HOST}/v1/companies/${encodeURIComponent(company)}/postings?destination=PUBLIC&limit=${limit}&offset=${offset}`;
    let response;
    try {
      response = await fetchJson(url, { ...deps, allowedHosts: [SMARTRECRUITERS_HOST] });
    } catch (error) {
      return {
        listings: [],
        complete: false,
        applyAbsencePolicy: false,
        pages,
        requests,
        error: error.message,
        completeness: { kind: 'smartrecruiters.offset', fetched: rows.length, verified: false },
      };
    }
    requests += 1;
    pages += 1;
    const body = response.json || {};
    const content = Array.isArray(body.content) ? body.content : null;
    if (!content) {
      return {
        listings: [],
        complete: false,
        applyAbsencePolicy: false,
        pages,
        requests,
        error: 'SmartRecruiters response did not include content.',
        completeness: { kind: 'smartrecruiters.offset', verified: false },
      };
    }
    if (Number.isFinite(Number(body.totalFound))) totalFound = Number(body.totalFound);
    rows.push(...content);
    offset += content.length;
    if (content.length < limit || (totalFound != null && offset >= totalFound)) break;
  }
  const truncated = (totalFound != null && offset < totalFound) || (totalFound == null && rows.length && rows.length % limit === 0 && pages >= maxPages);
  const cap = deps.detailCap || 80;
  const oracleOnly = !!(source.adapterConfig && source.adapterConfig.oracleOnly);
  const titled = (row) => greenhouseCandidate({
    title: [row.name, row.department && (row.department.label || row.department.name)].filter(Boolean).join(' '),
  });
  const selected = oracleOnly && rows.length > cap ? rows.filter(titled).slice(0, cap) : rows;
  const listings = [];
  const warnings = [];
  for (let index = 0; index < selected.length; index += 1) {
    const row = selected[index];
    const needsDetail = !smartRecruitersText(row);
    if (!needsDetail) {
      const mapped = mapSmartRecruitersJob(row);
      if (!oracleOnly || relevantOracleListing(mapped)) listings.push(mapped);
      continue;
    }
    if (pauseMs) await sleep(pauseMs);
    requests += 1;
    try {
      const detail = await fetchJson(`https://${SMARTRECRUITERS_HOST}/v1/companies/${encodeURIComponent(company)}/postings/${encodeURIComponent(row.id)}`, {
        ...deps,
        allowedHosts: [SMARTRECRUITERS_HOST],
      });
      const mapped = mapSmartRecruitersJob({ ...row, ...(detail.json || {}) });
      if (!oracleOnly || relevantOracleListing(mapped)) listings.push(mapped);
    } catch (error) {
      warnings.push(error.message);
    }
  }
  const detailTruncated = oracleOnly && rows.length > cap && selected.length < rows.filter(titled).length;
  const complete = !truncated && !detailTruncated && warnings.length === 0;
  return {
    listings: uniqueListings(listings),
    complete,
    applyAbsencePolicy: complete,
    pages,
    requests,
    warnings,
    error: warnings.length ? 'One or more SmartRecruiters job details could not be read.' : '',
    completeness: {
      kind: 'smartrecruiters.offset',
      reported: totalFound,
      fetched: rows.length,
      detailed: listings.length,
      verified: complete,
    },
  };
}

function jsonLdJobs(html) {
  const blocks = [...String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const jobs = [];
  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]);
    for (const node of nodes) {
      if (!node || !/JobPosting/i.test(String(node['@type'] || ''))) continue;
      jobs.push(node);
    }
  }
  return jobs;
}

function mapJsonLdJob(job, pageUrl) {
  const locations = [];
  const jobLocations = Array.isArray(job.jobLocation) ? job.jobLocation : (job.jobLocation ? [job.jobLocation] : []);
  for (const location of jobLocations) {
    const address = location && location.address;
    const label = address
      ? [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(', ')
      : (location && location.name);
    if (label) {
      locations.push({
        label: String(label),
        locality: address && address.addressLocality ? String(address.addressLocality) : null,
        region: address && address.addressRegion ? String(address.addressRegion) : null,
        country: address && address.addressCountry ? String(address.addressCountry) : null,
      });
    }
  }
  let publishedAt = null;
  if (typeof job.datePosted === 'string') {
    const parsedDate = new Date(job.datePosted);
    if (!Number.isNaN(parsedDate.getTime())) publishedAt = parsedDate;
  }
  const identifier = job.identifier && (job.identifier.value || job.identifier);
  const url = typeof job.url === 'string' && job.url ? job.url : pageUrl;
  let canonical = null;
  try {
    if (url) canonical = canonicalUrl(url);
  } catch {
    canonical = null;
  }
  return {
    sourceJobId: typeof identifier === 'string' && identifier ? identifier : `structured:${sha256(canonical || String(url || job.title || '')).slice(0, 24)}`,
    canonicalUrl: canonical,
    title: typeof job.title === 'string' ? job.title : '',
    descriptionHtml: typeof job.description === 'string' ? job.description : '',
    locations,
    publishedAt,
    employmentType: typeof job.employmentType === 'string' ? job.employmentType : null,
  };
}

function nextPageUrl(html, pageUrl) {
  const match = String(html || '').match(/<link[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i)
    || String(html || '').match(/<a[^>]+rel=["']next["'][^>]+href=["']([^"']+)["']/i);
  if (!match) return null;
  try {
    return new URL(match[1], pageUrl).toString();
  } catch {
    return null;
  }
}

async function collectStructuredPage(source, deps) {
  const start = String((source.adapterConfig && source.adapterConfig.pageUrl) || source.careerSiteUrl || '').trim();
  if (!start) throw new SourceFetchError('Structured page URL is missing.', { retryable: false });
  const maxPages = deps.maxPages || 5;
  const pauseMs = deps.minIntervalMs != null ? deps.minIntervalMs : 400;
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const listings = [];
  let pageUrl = start;
  let pages = 0;
  let requests = 0;
  const warnings = [];
  let sawNext = false;
  while (pageUrl && pages < maxPages) {
    if (pages > 0 && pauseMs) await sleep(pauseMs);
    let response;
    try {
      response = await fetchPublic(pageUrl, { ...deps, accept: 'text/html', maxBytes: 2_000_000 });
    } catch (error) {
      return {
        listings,
        complete: false,
        applyAbsencePolicy: false,
        pages,
        requests,
        error: error.message,
        warnings,
        completeness: { kind: 'html.jobposting', fetched: listings.length, verified: false },
      };
    }
    requests += 1;
    pages += 1;
    const html = response.body || '';
    const jobs = jsonLdJobs(html).map((job) => mapJsonLdJob(job, response.url || pageUrl)).filter((job) => job.title || job.sourceJobId);
    listings.push(...jobs);
    const next = nextPageUrl(html, response.url || pageUrl);
    if (!next) {
      pageUrl = null;
      break;
    }
    sawNext = true;
    try {
      const nextUrl = new URL(next);
      const current = new URL(response.url || pageUrl);
      if (nextUrl.hostname !== current.hostname) {
        warnings.push('The next page is on a different host and was not followed.');
        pageUrl = null;
      } else {
        pageUrl = nextUrl.toString();
      }
    } catch {
      pageUrl = null;
    }
  }
  const hitCap = sawNext && pages >= maxPages && pageUrl;
  const complete = listings.length > 0 && !hitCap && warnings.length === 0 && !pageUrl;
  return {
    listings: uniqueListings(listings),
    complete,
    applyAbsencePolicy: false,
    pages,
    requests,
    warnings,
    error: listings.length ? '' : 'The public page did not include JobPosting structured data.',
    completeness: { kind: 'html.jobposting', fetched: listings.length, pages, verified: false },
  };
}

async function collectSource(source, deps) {
  if (source.adapterType === 'greenhouse-job-board') return collectGreenhouse(source, deps);
  if (source.adapterType === 'lever-postings') return collectLever(source, deps);
  if (source.adapterType === 'ashby-job-board') return collectAshby(source, deps);
  if (source.adapterType === 'smartrecruiters-postings') return collectSmartRecruiters(source, deps);
  if (source.adapterType === 'public-structured') return collectStructuredPage(source, deps);
  if (source.adapterType === 'public-search') {
    const { collectPublicSearch } = require('./publicSearch');
    return collectPublicSearch(source, deps);
  }
  if (source.adapterType === 'dice-mcp') {
    const { collectDice } = require('./dice');
    return collectDice(source, deps);
  }
  throw new SourceFetchError(`Adapter ${source.adapterType} cannot run a source-wide refresh.`, { retryable: false });
}

module.exports = {
  ADAPTERS,
  adapterById,
  mapGreenhouseJob,
  mapLeverJob,
  greenhouseCandidate,
  collectGreenhouse,
  collectLever,
  collectAshby,
  collectSmartRecruiters,
  collectStructuredPage,
  collectSource,
  parseKnownJobUrl,
  importPublicUrl,
  jsonLdJob,
};
