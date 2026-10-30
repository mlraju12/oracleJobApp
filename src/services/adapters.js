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
  return /\boracle\b|\bpeoplesoft\b|\bpeople\s*soft\b|\bfusion\b|\be-?business\b|\bhcm\b|\bfast formula|\bcore hr\b/i.test(blob);
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
  const blocks = [...String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]);
    const job = nodes.find((node) => node && /JobPosting/i.test(String(node['@type'] || '')));
    if (!job || typeof job !== 'object') continue;
    const locations = [];
    const jobLocations = Array.isArray(job.jobLocation) ? job.jobLocation : (job.jobLocation ? [job.jobLocation] : []);
    for (const location of jobLocations) {
      const address = location && location.address;
      const label = address
        ? [address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(', ')
        : (location && location.name);
      if (label) locations.push({ label: String(label) });
    }
    let publishedAt = null;
    if (typeof job.datePosted === 'string') {
      const parsedDate = new Date(job.datePosted);
      if (!Number.isNaN(parsedDate.getTime())) publishedAt = parsedDate;
    }
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
      title: typeof job.title === 'string' ? job.title : '',
      description: typeof job.description === 'string' ? job.description : '',
      employmentType: typeof job.employmentType === 'string' ? job.employmentType : null,
      identifier: job.identifier && typeof job.identifier.value === 'string' ? job.identifier.value : null,
      locations,
      publishedAt,
      compensation,
    };
  }
  return {};
}

async function collectSource(source, deps) {
  if (source.adapterType === 'greenhouse-job-board') return collectGreenhouse(source, deps);
  if (source.adapterType === 'lever-postings') return collectLever(source, deps);
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
  collectGreenhouse,
  collectLever,
  collectSource,
  parseKnownJobUrl,
  importPublicUrl,
  jsonLdJob,
};
