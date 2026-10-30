const { canonicalUrl } = require('./text');
const { assertSafeOutboundUrl } = require('./outbound');
const { SourceFetchError } = require('./publicFetch');
const { classifyOracleHcm } = require('./classify');
const { classFromDice } = require('./employerClass');

const DICE_MCP = 'https://mcp.dice.com/mcp';

const DICE_KEYWORDS = [
  'Oracle Cloud HCM',
  'Oracle Fusion HCM',
  'Oracle Cloud Payroll',
  'Oracle Fusion Payroll',
  'Oracle Cloud Time and Labor',
  'Oracle Fusion Time and Labor',
  'Oracle Cloud Absence',
  'Oracle Fusion Absence Management',
  'Oracle Cloud Fast Formulas',
  'Oracle Cloud Benefits',
  'Oracle Cloud Journeys',
  'Oracle Cloud HCM Security',
  'Oracle Fusion Security',
  'Oracle Cloud HCM Reports',
  'Oracle Cloud HCM entry level',
  'Oracle Cloud HCM intern',
];

function parseSsePayload(text) {
  const match = String(text || '').match(/data:\s*(\{[\s\S]*\})/);
  if (!match) throw new SourceFetchError('Dice did not return a job-search message.', { retryable: false });
  const message = JSON.parse(match[1]);
  const content = message.result && message.result.content;
  const raw = content && content[0] && content[0].text;
  if (!raw) throw new SourceFetchError('Dice job search did not include a result.', { retryable: false });
  return JSON.parse(raw);
}

function mapDiceJob(job) {
  const posted = job.postedDate ? new Date(job.postedDate) : null;
  const location = job.jobLocation && job.jobLocation.displayName;
  const employerClass = classFromDice(job.employerType);
  return {
    sourceJobId: String(job.guid || job.id || ''),
    canonicalUrl: job.detailsPageUrl ? canonicalUrl(job.detailsPageUrl) : null,
    title: job.title || '',
    descriptionText: [job.summary, job.salary].filter(Boolean).join('\n'),
    employmentType: job.employmentType || null,
    locations: location ? [{ label: location }] : [],
    publishedAt: posted && !Number.isNaN(posted.getTime()) ? posted : null,
    employerName: job.companyName || '',
    hiringContext: employerClass.hiringContext,
    sourceOwnership: employerClass.sourceOwnership,
    employerType: employerClass.employerType,
    hiringRelationship: employerClass.hiringRelationship,
    classificationEvidence: employerClass.classificationEvidence,
    verificationBasis: 'source_job_list',
  };
}

async function diceCall(deps, body) {
  const url = assertSafeOutboundUrl(DICE_MCP, { allowedHosts: ['mcp.dice.com'] }).toString();
  const fetchImpl = deps.fetchImpl || global.fetch;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'user-agent': 'SLPMicrosystems-OracleHCMOpportunities/1.0',
    },
    body: JSON.stringify(body),
  });
  if (response.status === 429 || response.status >= 500) {
    throw new SourceFetchError(`Dice responded ${response.status}.`, { retryable: true, statusCode: response.status });
  }
  if (!response.ok) {
    throw new SourceFetchError(`Dice responded ${response.status}.`, { retryable: false, statusCode: response.status });
  }
  const text = await response.text();
  return parseSsePayload(text);
}

async function collectDice(source, deps) {
  const keywords = (source.adapterConfig && source.adapterConfig.keywords) || DICE_KEYWORDS;
  const pageCap = deps.maxPages || (source.adapterConfig && source.adapterConfig.maxPages) || (keywords.length > 4 ? 1 : 3);
  const pageSize = 25;
  const pause = deps.minIntervalMs != null ? deps.minIntervalMs : 400;
  const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const seen = new Map();
  let requests = 0;
  let reported = 0;
  let more = false;
  for (const keyword of keywords) {
    for (let page = 1; page <= pageCap; page += 1) {
      if (requests && pause) await sleep(pause);
      requests += 1;
      const payload = await diceCall(deps, {
        jsonrpc: '2.0',
        id: requests,
        method: 'tools/call',
        params: {
          name: 'search_jobs',
          arguments: { keyword, jobs_per_page: pageSize, page_number: page },
        },
      });
      const jobs = Array.isArray(payload.data) ? payload.data : [];
      const total = payload.meta && Number(payload.meta.totalResults);
      if (page === 1 && Number.isFinite(total)) reported += total;
      if ((payload.meta && payload.meta.pageCount > pageCap) || jobs.length === pageSize && page === pageCap) more = true;
      for (const job of jobs) {
        const mapped = mapDiceJob(job);
        if (!mapped.sourceJobId || seen.has(mapped.sourceJobId)) continue;
        const platform = classifyOracleHcm({ title: mapped.title, description: mapped.descriptionText }).platform;
        if (platform === 'unrelated') continue;
        seen.set(mapped.sourceJobId, mapped);
      }
      if (jobs.length < pageSize) break;
    }
  }
  const listings = [...seen.values()];
  const complete = !more;
  return {
    listings,
    complete,
    applyAbsencePolicy: complete,
    pages: requests,
    requests,
    warnings: complete ? [] : ['Dice search has more pages than this refresh reads.'],
    completeness: {
      kind: 'dice.mcp.search',
      fetched: listings.length,
      reported,
      verified: complete,
    },
  };
}

module.exports = {
  DICE_KEYWORDS,
  parseSsePayload,
  mapDiceJob,
  collectDice,
};
