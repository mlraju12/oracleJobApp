const { EmployerSource } = require('../models');
const { DICE_KEYWORDS } = require('./dice');
const { employerKey } = require('./text');
const { isDue, refreshSource } = require('./collect');
const { classFromSource } = require('./employerClass');

const REVIEWED_ON = '2026-10-30';

const PUBLIC_BOARDS = [
  {
    key: 'greenhouse:accenturefederalservices',
    name: 'Accenture Federal Services',
    domain: 'accenture.com',
    careerSiteUrl: 'https://boards.greenhouse.io/accenturefederalservices',
    atsProvider: 'greenhouse',
    adapterType: 'greenhouse-job-board',
    ownership: 'direct_employer',
    accessDocumentationUrl: 'https://developers.greenhouse.io/job-board.html',
    accessNotes: `Public Greenhouse Job Board API. Board accenturefederalservices returned HTTP 200 on ${REVIEWED_ON}. The jobs list is the full published set. Oracle-related jobs are read from the documented single-job endpoint because the board has more than 80 postings.`,
    termsNotes: `Greenhouse documents an unauthenticated public GET for published job posts. Reviewed ${REVIEWED_ON}. Application POST is not used.`,
    adapterConfig: { boardToken: 'accenturefederalservices', oracleOnly: true, minIntervalMs: 400 },
  },
  {
    key: 'greenhouse:m9solutions',
    name: 'M9 Solutions',
    domain: 'm9solutions.com',
    careerSiteUrl: 'https://job-boards.greenhouse.io/m9solutions',
    atsProvider: 'greenhouse',
    adapterType: 'greenhouse-job-board',
    ownership: 'direct_employer',
    accessDocumentationUrl: 'https://developers.greenhouse.io/job-board.html',
    accessNotes: `Public Greenhouse Job Board API. Board m9solutions returned HTTP 200 on ${REVIEWED_ON}. The full published list is small enough to read with content=true, then Oracle wording is kept.`,
    termsNotes: `Greenhouse documents an unauthenticated public GET for published job posts. Reviewed ${REVIEWED_ON}. Application POST is not used.`,
    adapterConfig: { boardToken: 'm9solutions', oracleOnly: true, minIntervalMs: 400 },
  },
  {
    key: 'greenhouse:pico',
    name: 'Pico',
    domain: 'pico.net',
    careerSiteUrl: 'https://job-boards.greenhouse.io/picoquantitativetrading',
    atsProvider: 'greenhouse',
    adapterType: 'greenhouse-job-board',
    ownership: 'direct_employer',
    accessDocumentationUrl: 'https://developers.greenhouse.io/job-board.html',
    accessNotes: `Public Greenhouse Job Board API. Board picoquantitativetrading returned HTTP 200 on ${REVIEWED_ON}. Employer site recorded as pico.net. Pico hires for its own Oracle Fusion HCM system, so this is a direct client rather than a consulting firm.`,
    hiringContext: 'direct_client',
    termsNotes: `Greenhouse documents an unauthenticated public GET for published job posts. Reviewed ${REVIEWED_ON}. Application POST is not used.`,
    adapterConfig: { boardToken: 'picoquantitativetrading', oracleOnly: true, minIntervalMs: 400 },
  },
  {
    key: 'greenhouse:apexit',
    name: 'Apex IT',
    domain: 'apexit.com',
    careerSiteUrl: 'https://job-boards.greenhouse.io/apexit',
    atsProvider: 'greenhouse',
    adapterType: 'greenhouse-job-board',
    ownership: 'direct_employer',
    accessDocumentationUrl: 'https://developers.greenhouse.io/job-board.html',
    accessNotes: `Public Greenhouse Job Board API. Board apexit returned HTTP 200 on ${REVIEWED_ON}. Oracle HCM, EBS, and PeopleSoft wording is kept. Other Oracle products stay out of the default feed.`,
    termsNotes: `Greenhouse documents an unauthenticated public GET for published job posts. Reviewed ${REVIEWED_ON}. Application POST is not used.`,
    adapterConfig: { boardToken: 'apexit', oracleOnly: true, minIntervalMs: 400 },
  },
  {
    key: 'greenhouse:sphereit',
    name: 'Sphere IT',
    domain: 'sphereit.com.br',
    careerSiteUrl: 'https://job-boards.greenhouse.io/sphereit',
    atsProvider: 'greenhouse',
    adapterType: 'greenhouse-job-board',
    ownership: 'direct_employer',
    accessDocumentationUrl: 'https://developers.greenhouse.io/job-board.html',
    accessNotes: `Public Greenhouse Job Board API. Board sphereit returned HTTP 200 on ${REVIEWED_ON}.`,
    termsNotes: `Greenhouse documents an unauthenticated public GET for published job posts. Reviewed ${REVIEWED_ON}. Application POST is not used.`,
    adapterConfig: { boardToken: 'sphereit', oracleOnly: true, minIntervalMs: 400 },
  },
  {
    key: 'lever:nextovation',
    name: 'NextOvation',
    domain: 'nextovation.com',
    careerSiteUrl: 'https://jobs.lever.co/nextovation',
    atsProvider: 'lever',
    adapterType: 'lever-postings',
    ownership: 'direct_employer',
    accessDocumentationUrl: 'https://github.com/lever/postings-api',
    accessNotes: `Public Lever Postings API. Site nextovation returned HTTP 200 JSON on ${REVIEWED_ON}. Postings without Oracle HCM, EBS, or PeopleSoft wording are not stored.`,
    termsNotes: `Lever documents a public JSON GET of published postings. Reviewed ${REVIEWED_ON}. Application POST is not used.`,
    adapterConfig: { site: 'nextovation', region: 'global', oracleOnly: true, minIntervalMs: 400 },
  },
  {
    key: 'greenhouse:attainpartners',
    name: 'Attain Partners',
    domain: 'attainpartners.com',
    careerSiteUrl: 'https://job-boards.greenhouse.io/attainpartners',
    atsProvider: 'greenhouse',
    adapterType: 'greenhouse-job-board',
    ownership: 'direct_employer',
    hiringContext: 'consulting_firm',
    accessDocumentationUrl: 'https://developers.greenhouse.io/job-board.html',
    accessNotes: `Public Greenhouse Job Board API. Board attainpartners returned the published list on ${REVIEWED_ON}, including Oracle Cloud HCM Consulting Manager. The single-job endpoint for that posting returned the requirements. Attain Partners is the consulting firm, not the end client.`,
    termsNotes: `Greenhouse documents an unauthenticated public GET for published job posts. Reviewed ${REVIEWED_ON}. Application POST is not used.`,
    adapterConfig: { boardToken: 'attainpartners', oracleOnly: true, minIntervalMs: 400 },
  },
  {
    key: 'greenhouse:eclipsyssolutions',
    name: 'DSP-Eclipsys',
    domain: 'dsp-eclipsys.com',
    careerSiteUrl: 'https://job-boards.greenhouse.io/eclipsyssolutions',
    atsProvider: 'greenhouse',
    adapterType: 'greenhouse-job-board',
    ownership: 'direct_employer',
    hiringContext: 'consulting_firm',
    accessDocumentationUrl: 'https://developers.greenhouse.io/job-board.html',
    accessNotes: `Public Greenhouse Job Board API. Board eclipsyssolutions returned HTTP 200 on ${REVIEWED_ON}. The published Principal Oracle Fusion Architect posting includes HCM alongside ERP and SCM. DSP-Eclipsys is the consulting firm.`,
    termsNotes: `Greenhouse documents an unauthenticated public GET for published job posts. Reviewed ${REVIEWED_ON}. Application POST is not used.`,
    adapterConfig: { boardToken: 'eclipsyssolutions', oracleOnly: true, minIntervalMs: 400 },
  },
  {
    key: 'lever:highstreetit',
    name: 'Highstreet IT',
    domain: 'highstreetit.com',
    careerSiteUrl: 'https://jobs.lever.co/highstreetit',
    atsProvider: 'lever',
    adapterType: 'lever-postings',
    ownership: 'direct_employer',
    hiringContext: 'consulting_firm',
    accessDocumentationUrl: 'https://github.com/lever/postings-api',
    accessNotes: `Public Lever Postings API. Site highstreetit returned HTTP 200 JSON on ${REVIEWED_ON}, including Oracle HCM consultant postings and their description text. Highstreet IT is the consulting firm, not the end client.`,
    termsNotes: `Lever documents a public JSON GET of published postings. Reviewed ${REVIEWED_ON}. Application POST is not used.`,
    adapterConfig: { site: 'highstreetit', region: 'global', oracleOnly: true, minIntervalMs: 400 },
  },
  {
    key: 'dice:oracle-cloud-hcm',
    name: 'Dice',
    domain: 'dice.com',
    careerSiteUrl: 'https://www.dice.com/jobs?q=Oracle%20Cloud%20HCM',
    atsProvider: 'dice',
    adapterType: 'dice-mcp',
    ownership: 'unknown',
    hiringContext: 'unknown',
    accessDocumentationUrl: 'https://www.dice.com/about/mcp',
    accessNotes: `Dice public job search at https://mcp.dice.com/mcp. No login. Checked ${REVIEWED_ON}. Each result includes postedDate and detailsPageUrl. The company on the posting is stored as published. Dice does not let this app submit the application.`,
    termsNotes: `Dice documents an unauthenticated public search of its job listings and says the caller hands the candidate the application link. Reviewed ${REVIEWED_ON}.`,
    adapterConfig: { keywords: DICE_KEYWORDS, maxPages: 1, minIntervalMs: 400 },
  },
  {
    key: 'public:deloitte',
    name: 'Deloitte',
    domain: 'deloitte.com',
    careerSiteUrl: 'https://apply.deloitte.com/en_US/careers/SearchJobs/Oracle%20Cloud%20HCM',
    atsProvider: 'avature',
    adapterType: 'public-search',
    ownership: 'direct_employer',
    accessMethod: 'public_page',
    accessDocumentationUrl: 'https://apply.deloitte.com/en_US/careers/SearchJobs/Oracle%20Cloud%20HCM',
    accessNotes: `Deloitte US public job search for Oracle Cloud HCM. The page links a public RSS feed and JobDetail URLs. Checked ${REVIEWED_ON}. Applying still happens on Deloitte’s site.`,
    termsNotes: `The search page and its linked feed are public. There is no application API key for this app to submit a resume. Reviewed ${REVIEWED_ON}.`,
    adapterConfig: {
      provider: 'deloitte',
      searchUrl: 'https://apply.deloitte.com/en_US/careers/SearchJobs/Oracle%20Cloud%20HCM',
      feedUrl: 'https://apply.deloitte.com/en_US/careers/SearchJobs/Oracle%20Cloud%20HCM/feed/?jobRecordsPerPage=10',
      minIntervalMs: 400,
    },
  },
  {
    key: 'public:ey',
    name: 'EY',
    domain: 'ey.com',
    careerSiteUrl: 'https://careers.ey.com/ey/search/?q=Oracle%20Cloud%20HCM&startrow=0',
    atsProvider: 'successfactors',
    adapterType: 'public-search',
    ownership: 'direct_employer',
    accessMethod: 'public_page',
    accessDocumentationUrl: 'https://careers.ey.com/ey/search/?q=Oracle%20Cloud%20HCM&startrow=0',
    accessNotes: `EY public job search HTML includes /ey/job links and startrow pagination. Checked ${REVIEWED_ON}.`,
    termsNotes: `Public search pages only. This app does not submit the EY application form. Reviewed ${REVIEWED_ON}.`,
    adapterConfig: {
      provider: 'ey',
      searchUrl: 'https://careers.ey.com/ey/search/?q=Oracle%20Cloud%20HCM&startrow=0',
      minIntervalMs: 400,
    },
  },
  {
    key: 'public:pwc',
    name: 'PwC',
    domain: 'pwc.com',
    careerSiteUrl: 'https://jobs-us.pwc.com/us/en/search-results?keywords=Oracle%20HCM',
    atsProvider: 'workday',
    adapterType: 'public-search',
    ownership: 'direct_employer',
    accessMethod: 'public_page',
    accessDocumentationUrl: 'https://jobs-us.pwc.com/us/en/search-results?keywords=Oracle%20HCM',
    accessNotes: `PwC US public search page embeds the first page of Oracle HCM results, including each apply URL. Checked ${REVIEWED_ON}. Later pages are not a documented feed, so a short first page stays partial.`,
    termsNotes: `Public search HTML only. Workday application POST is not used. Reviewed ${REVIEWED_ON}.`,
    adapterConfig: {
      provider: 'pwc',
      searchUrl: 'https://jobs-us.pwc.com/us/en/search-results?keywords=Oracle%20HCM',
    },
  },
  {
    key: 'public:kpmg',
    name: 'KPMG',
    domain: 'kpmg.com',
    careerSiteUrl: 'https://www.kpmguscareers.com/job-search/',
    atsProvider: 'avature',
    adapterType: 'public-search',
    ownership: 'direct_employer',
    status: 'unsupported',
    accessDocumentationUrl: 'https://www.kpmguscareers.com/job-search/',
    accessNotes: `KPMG US job search HTML did not include job listings on ${REVIEWED_ON}. The list is loaded after the page, and there is no documented public jobs API. No listings are invented.`,
    termsNotes: 'Unsupported until a public job feed is documented. Apply only on KPMG’s site.',
    adapterConfig: { provider: 'kpmg' },
  },
  {
    key: 'public:accenture',
    name: 'Accenture',
    domain: 'accenture.com',
    careerSiteUrl: 'https://www.accenture.com/us-en/careers/jobsearch',
    atsProvider: 'unknown',
    adapterType: 'public-search',
    ownership: 'direct_employer',
    status: 'unsupported',
    accessDocumentationUrl: 'https://www.accenture.com/us-en/careers/jobsearch',
    accessNotes: `Accenture’s main job search page did not include listings in the public HTML on ${REVIEWED_ON}. Accenture Federal Services remains a separate Greenhouse board that does publish jobs.`,
    termsNotes: 'Unsupported for the corporate search. Federal listings use the Greenhouse Job Board API.',
    adapterConfig: { provider: 'accenture' },
  },
];

const running = new Set();

function boardRecord(tenantId, board) {
  return {
    tenantId,
    catalogKey: board.key,
    name: board.name,
    domain: board.domain,
    employerKey: employerKey(board.domain),
    careerSiteUrl: board.careerSiteUrl,
    atsProvider: board.atsProvider,
    adapterType: board.adapterType,
    ownership: board.ownership,
    hiringContext: board.hiringContext || 'consulting_firm',
    ...classFromSource({
      hiringContext: board.hiringContext || (board.adapterType === 'dice-mcp' ? 'unknown' : 'consulting_firm'),
      employerType: board.employerType,
      hiringRelationship: board.hiringRelationship,
      classificationEvidence: board.classificationEvidence,
    }),
    accessMethod: board.accessMethod || 'public_api',
    accessDocumentationUrl: board.accessDocumentationUrl,
    accessNotes: board.accessNotes,
    termsReviewStatus: 'public_read_documented',
    termsNotes: board.termsNotes,
    refreshIntervalMinutes: 360,
    status: board.status || 'enabled',
    adapterConfig: board.adapterConfig,
    synthetic: false,
  };
}

async function ensurePublicCatalog(tenantId) {
  const sources = [];
  for (const board of PUBLIC_BOARDS) {
    let source = await EmployerSource.findOne({ tenantId, catalogKey: board.key });
    if (!source) {
      source = await EmployerSource.create(boardRecord(tenantId, board));
    } else if (board.adapterConfig && Array.isArray(board.adapterConfig.keywords)) {
      const current = (source.adapterConfig && source.adapterConfig.keywords) || [];
      if (JSON.stringify(current) !== JSON.stringify(board.adapterConfig.keywords)) {
        source.adapterConfig = {
          ...(source.adapterConfig || {}),
          keywords: board.adapterConfig.keywords,
          maxPages: board.adapterConfig.maxPages,
        };
        source.markModified('adapterConfig');
        await source.save();
      }
    }
    sources.push(source);
  }
  return sources;
}

function catalogRefreshRunning(tenantId) {
  return running.has(String(tenantId));
}

async function startCatalogRefresh(tenantId, deps, options = {}) {
  const key = String(tenantId);
  if (running.has(key)) return true;
  running.add(key);
  let due = [];
  try {
    const sources = await ensurePublicCatalog(tenantId);
    for (const source of sources) {
      const current = await EmployerSource.findOne({ _id: source._id, tenantId });
      if (!current || !['enabled', 'failing'].includes(current.status)) continue;
      if (!options.force && !isDue(current, new Date())) continue;
      due.push(current);
    }
  } catch (error) {
    running.delete(key);
    throw error;
  }
  if (!due.length) {
    running.delete(key);
    return false;
  }
  setImmediate(async () => {
    try {
      for (const source of due) {
        const current = await EmployerSource.findOne({ _id: source._id, tenantId });
        if (!current || !['enabled', 'failing'].includes(current.status)) continue;
        await refreshSource(current, deps);
      }
    } catch (error) {
      console.error(`Public career collection failed: ${error.message}`);
    } finally {
      running.delete(key);
    }
  });
  return true;
}

module.exports = {
  PUBLIC_BOARDS,
  ensurePublicCatalog,
  startCatalogRefresh,
  catalogRefreshRunning,
};
