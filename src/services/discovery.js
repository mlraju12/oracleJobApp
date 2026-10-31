const { EmployerLead, EmployerSource, Opportunity } = require('../models');
const { DISCOVERY_LEADS } = require('./discoveryLeads');
const { employerKey } = require('./text');
const { assertSafeOutboundUrl } = require('./outbound');
const { fetchPublic } = require('./publicFetch');
const { classFromSource } = require('./employerClass');
const { relationshipOf, scheduleOf } = require('./reconcile');

const DOCUMENTED_BOARDS = [
  {
    platform: 'greenhouse',
    adapterType: 'greenhouse-job-board',
    hosts: ['boards.greenhouse.io', 'job-boards.greenhouse.io'],
    documentationUrl: 'https://developers.greenhouse.io/job-board.html',
  },
  {
    platform: 'lever',
    adapterType: 'lever-postings',
    hosts: ['jobs.lever.co', 'jobs.eu.lever.co'],
    documentationUrl: 'https://github.com/lever/postings-api',
  },
  {
    platform: 'ashby',
    adapterType: 'ashby-job-board',
    hosts: ['jobs.ashbyhq.com'],
    documentationUrl: 'https://developers.ashbyhq.com/docs/public-job-posting-api',
  },
  {
    platform: 'smartrecruiters',
    adapterType: 'smartrecruiters-postings',
    hosts: ['jobs.smartrecruiters.com', 'careers.smartrecruiters.com'],
    documentationUrl: 'https://developers.smartrecruiters.com/docs/posting-api',
  },
];

function searchProviderStatus() {
  const endpoint = String(process.env.DISCOVERY_SEARCH_ENDPOINT || '').trim();
  const key = String(process.env.DISCOVERY_SEARCH_KEY || '').trim();
  const missing = [];
  if (!endpoint) missing.push('DISCOVERY_SEARCH_ENDPOINT');
  if (!key) missing.push('DISCOVERY_SEARCH_KEY');
  if (missing.length) {
    return {
      configured: false,
      missing,
      message: `Web search is not configured. Set ${missing.join(' and ')} to a provider that returns result URLs. Official careers URLs can still be imported by hand. No company domain or board identifier is generated to fill the gap.`,
    };
  }
  return { configured: true, missing: [], message: 'Search provider settings are present.' };
}

function identifierFrom(url) {
  const part = url.pathname.split('/').filter(Boolean)[0] || '';
  return /^[A-Za-z0-9_-]{1,80}$/.test(part) ? part : '';
}

function unsupportedHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host.endsWith('myworkdayjobs.com') || host.endsWith('myworkday.com')) {
    return { platform: 'workday', reason: 'The career board is Workday. This app does not call the undocumented Workday CXS endpoint.' };
  }
  if (host.endsWith('oraclecloud.com')) {
    return { platform: 'oracle_recruiting', reason: 'Oracle documents recruitingCEJobRequisitions as internal use only. This app does not call it.' };
  }
  if (host.includes('successfactors') || host.endsWith('sapsf.com') || host.endsWith('sapsf.eu')) {
    return { platform: 'successfactors', reason: 'This SuccessFactors host has no public job-list API in this app.' };
  }
  if (host.endsWith('avature.net')) {
    return { platform: 'avature', reason: 'This Avature host has no public job-list API in this app.' };
  }
  return null;
}

function boardFromUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || ''));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const documented = DOCUMENTED_BOARDS.find((board) => board.hosts.includes(host));
  if (documented) {
    const boardIdentifier = identifierFrom(url);
    if (!boardIdentifier) return null;
    return {
      platform: documented.platform,
      adapterType: documented.adapterType,
      boardIdentifier,
      resolvedBoardUrl: `${url.origin}/${boardIdentifier}`,
      documentationUrl: documented.documentationUrl,
      connectorStatus: 'supported',
    };
  }
  const blocked = unsupportedHost(host);
  if (!blocked) return null;
  return {
    platform: blocked.platform,
    adapterType: '',
    boardIdentifier: '',
    resolvedBoardUrl: url.origin,
    connectorStatus: 'unsupported',
    connectorReason: blocked.reason,
  };
}

function hrefs(html, pageUrl) {
  const found = [];
  const pattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match = pattern.exec(String(html || ''));
  while (match && found.length < 200) {
    try {
      found.push(new URL(match[1], pageUrl).toString());
    } catch {
      // Ignore malformed links in untrusted HTML.
    }
    match = pattern.exec(String(html || ''));
  }
  return found;
}

function detectBoard(pageUrl, html) {
  const self = boardFromUrl(pageUrl);
  if (self && self.connectorStatus === 'supported') return self;
  for (const link of hrefs(html, pageUrl)) {
    let safe = null;
    try {
      safe = assertSafeOutboundUrl(link).toString();
    } catch {
      continue;
    }
    const board = boardFromUrl(safe);
    if (board && board.connectorStatus === 'supported') return board;
  }
  if (self && self.connectorStatus === 'unsupported') return self;
  for (const link of hrefs(html, pageUrl)) {
    try {
      const board = boardFromUrl(assertSafeOutboundUrl(link).toString());
      if (board && board.connectorStatus === 'unsupported') return board;
    } catch {
      // Private or credentialed links are ignored.
    }
  }
  return null;
}

function adapterConfigFor(board) {
  if (board.platform === 'greenhouse') return { boardToken: board.boardIdentifier, oracleOnly: true, minIntervalMs: 400 };
  if (board.platform === 'lever') {
    return {
      site: board.boardIdentifier,
      region: board.resolvedBoardUrl.includes('jobs.eu.lever.co') ? 'eu' : 'global',
      oracleOnly: true,
      minIntervalMs: 400,
    };
  }
  if (board.platform === 'ashby') return { boardName: board.boardIdentifier, oracleOnly: true, minIntervalMs: 400 };
  if (board.platform === 'smartrecruiters') return { companyIdentifier: board.boardIdentifier, oracleOnly: true, minIntervalMs: 400 };
  return {};
}

function presentLead(lead, source) {
  return {
    id: String(lead._id),
    key: lead.key,
    name: lead.name,
    domain: lead.domain || '',
    careersUrl: lead.careersUrl || '',
    resolvedBoardUrl: lead.resolvedBoardUrl || '',
    platform: lead.platform || '',
    boardIdentifier: lead.boardIdentifier || '',
    geography: lead.geography || '',
    employerType: lead.employerType || 'unknown',
    hiringRelationship: lead.hiringRelationship || 'unknown',
    evidenceUrl: lead.evidenceUrl || '',
    connectorStatus: lead.connectorStatus,
    connectorReason: lead.connectorReason || '',
    cohort: lead.cohort || '',
    catalogKey: lead.catalogKey || '',
    sourceId: lead.sourceId ? String(lead.sourceId) : (source ? String(source._id) : ''),
    lastSuccessfulCrawlAt: (source && source.lastSuccessfulCollectionAt) || lead.lastSuccessfulCrawlAt || null,
    stage: source && source.lastSuccessfulCollectionAt ? 'collected' : (lead.resolvedBoardUrl ? 'board_checked' : 'discovered'),
  };
}

async function ensureDiscoveryRegistry(tenantId) {
  const leads = [];
  for (const seed of DISCOVERY_LEADS) {
    let lead = await EmployerLead.findOne({ tenantId, key: seed.key });
    if (!lead) {
      lead = await EmployerLead.create({ ...seed, tenantId, stage: 'discovered' });
    }
    if (seed.catalogKey) {
      const source = await EmployerSource.findOne({ tenantId, catalogKey: seed.catalogKey });
      if (source && String(lead.sourceId || '') !== String(source._id)) {
        lead.sourceId = source._id;
        lead.lastSuccessfulCrawlAt = source.lastSuccessfulCollectionAt || lead.lastSuccessfulCrawlAt;
        await lead.save();
      }
    }
    leads.push(lead);
  }
  return leads;
}

async function linkSupportedSource(tenantId, lead) {
  if (lead.connectorStatus !== 'supported' || !lead.boardIdentifier || !lead.domain) return null;
  if (!['end_user', 'consulting_firm'].includes(lead.employerType)) return null;
  const board = {
    platform: lead.platform,
    adapterType: ({
      greenhouse: 'greenhouse-job-board',
      lever: 'lever-postings',
      ashby: 'ashby-job-board',
      smartrecruiters: 'smartrecruiters-postings',
    })[lead.platform],
    boardIdentifier: lead.boardIdentifier,
    resolvedBoardUrl: lead.resolvedBoardUrl,
  };
  if (!board.adapterType) return null;
  const catalogKey = `discovery:${lead.key}`;
  let source = await EmployerSource.findOne({ tenantId, catalogKey });
  const classification = classFromSource({
    employerType: lead.employerType,
    hiringRelationship: lead.hiringRelationship || 'own_team',
    classificationEvidence: lead.connectorReason,
  });
  if (!source) {
    source = await EmployerSource.create({
      tenantId,
      catalogKey,
      name: lead.name,
      domain: lead.domain,
      employerKey: employerKey(lead.domain),
      careerSiteUrl: lead.resolvedBoardUrl || lead.careersUrl,
      atsProvider: lead.platform,
      adapterType: board.adapterType,
      ownership: 'direct_employer',
      hiringContext: lead.employerType === 'consulting_firm' ? 'consulting_firm' : 'direct_client',
      ...classification,
      accessMethod: 'public_api',
      accessDocumentationUrl: (DOCUMENTED_BOARDS.find((item) => item.platform === lead.platform) || {}).documentationUrl || '',
      accessNotes: lead.connectorReason,
      termsReviewStatus: 'public_read_documented',
      termsNotes: 'Board identifier was read from the official careers URL. Application POST is not used.',
      status: 'enabled',
      adapterConfig: adapterConfigFor(board),
      synthetic: false,
    });
  }
  lead.sourceId = source._id;
  lead.stage = 'board_checked';
  await lead.save();
  return source;
}

async function resolveLead(lead, deps = {}) {
  if (!lead.careersUrl) {
    lead.connectorStatus = lead.connectorStatus === 'supported' ? lead.connectorStatus : 'unresolved';
    lead.connectorReason = lead.connectorReason || 'No official careers URL is stored, so no board was requested.';
    lead.stage = 'discovered';
    await lead.save();
    return lead;
  }
  assertSafeOutboundUrl(lead.careersUrl, { allowHttp: process.env.NODE_ENV !== 'production' });
  let response;
  try {
    response = await fetchPublic(lead.careersUrl, {
      ...deps,
      accept: 'text/html, application/json;q=0.5',
      maxBytes: 2_000_000,
    });
  } catch (error) {
    lead.connectorStatus = 'unresolved';
    lead.connectorReason = error.message || 'The careers URL could not be read.';
    lead.stage = 'board_checked';
    await lead.save();
    return lead;
  }
  const found = detectBoard(response.url || lead.careersUrl, response.body || '');
  lead.stage = 'board_checked';
  if (!found) {
    lead.connectorStatus = 'unresolved';
    lead.platform = '';
    lead.boardIdentifier = '';
    lead.resolvedBoardUrl = '';
    lead.connectorReason = 'The public page did not publish a Greenhouse, Lever, Ashby, or SmartRecruiters board, and it is not a Workday, Oracle Cloud, SuccessFactors, or Avature host. No board identifier was guessed.';
    await lead.save();
    return lead;
  }
  lead.platform = found.platform;
  lead.boardIdentifier = found.boardIdentifier || '';
  lead.resolvedBoardUrl = found.resolvedBoardUrl || '';
  lead.connectorStatus = found.connectorStatus;
  lead.connectorReason = found.connectorReason || `Board ${found.boardIdentifier || found.platform} was read from the careers page. The page text is untrusted and was not stored.`;
  await lead.save();
  if (found.connectorStatus === 'supported' && lead.domain && ['end_user', 'consulting_firm'].includes(lead.employerType)) {
    await linkSupportedSource(lead.tenantId, lead);
  }
  return lead;
}

async function importEmployer(tenantId, input, deps, options = {}) {
  const name = String(input.name || '').trim().slice(0, 160);
  const careersUrl = String(input.careersUrl || '').trim();
  const evidenceUrl = String(input.evidenceUrl || careersUrl).trim();
  if (!name) {
    const error = new Error('Employer name is required.');
    error.status = 400;
    throw error;
  }
  if (!careersUrl) {
    const error = new Error('An official careers URL is required.');
    error.status = 400;
    throw error;
  }
  assertSafeOutboundUrl(careersUrl, { allowHttp: process.env.NODE_ENV !== 'production' });
  if (evidenceUrl) assertSafeOutboundUrl(evidenceUrl, { allowHttp: process.env.NODE_ENV !== 'production' });
  const domain = String(input.domain || '').trim().toLowerCase();
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    const error = new Error('Official domain must be a public hostname such as example.com.');
    error.status = 400;
    throw error;
  }
  const employerType = ['end_user', 'consulting_firm', 'staffing_agency', 'unknown'].includes(input.employerType)
    ? input.employerType
    : 'unknown';
  const key = `import:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)}`;
  let lead = await EmployerLead.findOne({ tenantId, key });
  const fields = {
    name,
    domain,
    careersUrl,
    evidenceUrl,
    geography: String(input.geography || '').slice(0, 120),
    employerType,
    hiringRelationship: employerType === 'unknown' ? 'unknown' : 'own_team',
    cohort: employerType === 'consulting_firm' ? 'consulting_board' : 'end_user_candidate',
    connectorStatus: 'candidate',
    connectorReason: 'Imported from an official careers URL. The board is resolved from that page, not from a guessed token.',
    stage: 'discovered',
  };
  if (!lead) lead = await EmployerLead.create({ tenantId, key, ...fields });
  else Object.assign(lead, fields);
  await lead.save();
  if (options.deferResolve) return lead;
  return resolveLead(lead, deps);
}

async function discoveryReport(tenantId) {
  const leads = await ensureDiscoveryRegistry(tenantId);
  const sources = await EmployerSource.find({ tenantId, synthetic: { $ne: true } });
  const byId = new Map(sources.map((source) => [String(source._id), source]));
  const byCatalog = new Map(sources.filter((source) => source.catalogKey).map((source) => [source.catalogKey, source]));
  const presented = leads.map((lead) => presentLead(lead, byId.get(String(lead.sourceId || '')) || byCatalog.get(lead.catalogKey)));
  const endUserLeads = presented.filter((lead) => lead.cohort !== 'consulting_board');
  const verified = presented.filter((lead) => lead.resolvedBoardUrl);
  const supported = presented.filter((lead) => lead.connectorStatus === 'supported');
  const collectedIds = presented
    .filter((lead) => lead.lastSuccessfulCrawlAt && lead.sourceId)
    .map((lead) => lead.sourceId);
  const relevantQuery = {
    tenantId,
    synthetic: { $ne: true },
    sourceId: { $in: collectedIds },
    'oracle.platform': { $in: ['oracle_cloud_hcm', 'mixed'] },
  };
  const relevant = collectedIds.length
    ? await Opportunity.find(relevantQuery).select('listingStatus applicationOpen employerType hiringRelationship employmentType engagement workingTime employmentRelationship workSchedule canonicalUrl title employerName')
    : [];
  const open = relevant.filter((item) => item.listingStatus === 'active' && item.applicationOpen === 'listed_by_source');
  const direct = open.filter((item) => item.employerType === 'end_user' && item.hiringRelationship === 'own_team');
  const schedule = { full_time: 0, part_time: 0, contract: 0, unknown: 0 };
  for (const item of direct) {
    const relation = relationshipOf(item);
    const hours = scheduleOf(item);
    if (relation === 'contractor') schedule.contract += 1;
    else if (hours === 'full_time') schedule.full_time += 1;
    else if (hours === 'part_time') schedule.part_time += 1;
    else schedule.unknown += 1;
  }
  return {
    search: searchProviderStatus(),
    batchSize: endUserLeads.length,
    batchTarget: 50,
    batchNote: endUserLeads.length < 50
      ? 'The end-user batch is smaller than 50 because web search is not configured and unverified names were not added.'
      : '',
    funnel: {
      candidateEmployers: endUserLeads.length,
      verifiedCareerBoards: verified.filter((lead) => lead.cohort !== 'consulting_board').length,
      supportedBoards: supported.filter((lead) => lead.cohort !== 'consulting_board').length,
      collectedBoards: presented.filter((lead) => lead.cohort !== 'consulting_board' && lead.lastSuccessfulCrawlAt).length,
      relevantRoles: relevant.length,
      verifiedOpenRoles: open.length,
      consultingSupportedBoards: supported.filter((lead) => lead.cohort === 'consulting_board').length,
    },
    directEndClient: {
      roles: direct.length,
      schedule,
      listings: direct.slice(0, 20).map((item) => ({
        title: item.title,
        employerName: item.employerName,
        canonicalUrl: item.canonicalUrl || '',
      })),
    },
    leads: presented,
  };
}

module.exports = {
  DISCOVERY_LEADS,
  searchProviderStatus,
  boardFromUrl,
  detectBoard,
  ensureDiscoveryRegistry,
  resolveLead,
  importEmployer,
  discoveryReport,
};
