const { PUBLIC_BOARDS, catalogNeedsSync } = require('../src/services/catalog');
const { collectOracleCandidateExperience } = require('../src/services/oracleCandidateExperience');
const { boardFromUrl } = require('../src/services/discovery');
const { isDue } = require('../src/services/collect');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function page(total, rows) {
  return {
    items: [{
      TotalJobsCount: total,
      requisitionList: rows,
    }],
  };
}

function row(id, title) {
  return {
    Id: id,
    Title: title,
    PostedDate: '2026-11-12',
    PrimaryLocation: 'Nashville, TN, United States',
    PrimaryLocationCountry: 'US',
    ShortDescriptionStr: `${title} at the university.`,
    WorkplaceTypeCode: 'ORA_ON_SITE',
    secondaryLocations: [],
  };
}

const READABLE = [
  ['Vanderbilt University', 'ecsr.fa.us2.oraclecloud.com', 'CX_1'],
  ['Baylor University', 'ejof.fa.us2.oraclecloud.com', 'CX'],
  ['Verisk', 'fa-ewmy-saasfaprod1.fa.ocs.oraclecloud.com', 'CX_1'],
  ['Jungbunzlauer', 'iabuas.fa.ocs.oraclecloud.com', 'CX_1'],
  ['Arqiva', 'ehik.fa.em3.oraclecloud.com', 'CX'],
  ['WMATA', 'ibpbjb.fa.ocs.oraclecloud.com', 'CX_2011'],
  ['BGIS', 'fa-evcg-saasfaprod1.fa.ocs.oraclecloud.com', 'CX_1'],
  ['Nokia', 'fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com', 'CX_1'],
  ['OSU Medical Center', 'osumc-iborjb.fa.ocs.oraclecloud.com', 'CX_1'],
];

const STILL_UNSUPPORTED = [
  'Northwell Health',
  'Morrisons',
  'ADT',
  'E.ON',
  'University of Windsor',
  'InvoCare',
  'Norfolk County Council',
];

describe('Oracle Candidate Experience reader', () => {
  const byName = new Map(PUBLIC_BOARDS.map((board) => [board.name, board]));

  test('enables career sites whose public URL names a site and leaves the others unsupported', () => {
    for (const [name, host, site] of READABLE) {
      const board = byName.get(name);
      expect(board.adapterType).toBe('oracle-candidate-experience');
      expect(board.status || 'enabled').toBe('enabled');
      expect(board.hiringContext).toBe('direct_client');
      expect(board.employerType).toBe('end_user');
      expect(board.adapterConfig.apiHost).toBe(host);
      expect(board.adapterConfig.siteNumber).toBe(site);
      expect(board.adapterConfig.siteUrl).toMatch(/^https:\/\//);
      expect(board.adapterConfig.listings).toBeUndefined();
    }
    expect(byName.get('Nokia').adapterConfig.siteUrl).toBe('https://jobs.nokia.com/en/sites/CX_1');
    for (const name of STILL_UNSUPPORTED) {
      const board = byName.get(name);
      expect(board.adapterType).toBe('public-search');
      expect(board.status).toBe('unsupported');
      expect(board.adapterConfig.listings).toBeUndefined();
    }
  });

  test('reads the public requisition list and does not invent rows past it', async () => {
    const calls = [];
    const result = await collectOracleCandidateExperience({
      adapterConfig: {
        apiHost: 'ejof.fa.us2.oraclecloud.com',
        siteNumber: 'CX',
        siteUrl: 'https://ejof.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX',
        minIntervalMs: 0,
      },
    }, {
      pageLimit: 1,
      maxPages: 5,
      retries: 1,
      backoffMs: 0,
      sleep: async () => {},
      minIntervalMs: 0,
      fetchImpl: async (url) => {
        calls.push(url);
        const offset = Number(new URL(url).searchParams.get('finder').match(/offset=(\d+)/)[1]);
        if (offset === 0) return jsonResponse(page(2, [row('22084', 'Events Coordinator')]));
        return jsonResponse(page(2, [row('22085', 'Administrative Associate')]));
      },
    });
    expect(result.complete).toBe(true);
    expect(result.applyAbsencePolicy).toBe(true);
    expect(result.listings.map((job) => job.title)).toEqual(['Events Coordinator', 'Administrative Associate']);
    expect(result.listings[0].canonicalUrl).toBe('https://ejof.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/22084');
    expect(result.listings[0].sourceJobId).toBe('22084');
    expect(result.listings[0].descriptionText).toBe('Events Coordinator at the university.');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('siteNumber=CX');
    expect(calls[0]).toContain('ejof.fa.us2.oraclecloud.com');
  });

  test('stays partial when the page cap stops before TotalJobsCount', async () => {
    const result = await collectOracleCandidateExperience({
      adapterConfig: {
        apiHost: 'fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com',
        siteNumber: 'CX_1',
        siteUrl: 'https://jobs.nokia.com/en/sites/CX_1',
      },
    }, {
      pageLimit: 1,
      maxPages: 1,
      retries: 1,
      backoffMs: 0,
      sleep: async () => {},
      minIntervalMs: 0,
      fetchImpl: async () => jsonResponse(page(587, [row('40705', 'Industrial Designer')])),
    });
    expect(result.complete).toBe(false);
    expect(result.applyAbsencePolicy).toBe(false);
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].canonicalUrl).toBe('https://jobs.nokia.com/en/sites/CX_1/job/40705');
    expect(result.completeness.reported).toBe(587);
  });

  test('does not invent listings when the career site denies access', async () => {
    await expect(collectOracleCandidateExperience({
      adapterConfig: {
        apiHost: 'ehik.fa.em3.oraclecloud.com',
        siteNumber: 'CX',
        siteUrl: 'https://ehik.fa.em3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX',
      },
    }, {
      retries: 1,
      backoffMs: 0,
      sleep: async () => {},
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        headers: { get: () => null },
        async text() { return ''; },
      }),
    })).rejects.toThrow(/denied access/);
  });

  test('rejects a host or site number that did not come from a public career URL', async () => {
    const fetchImpl = async () => {
      throw new Error('The reader should not request a host or site number it has not accepted.');
    };
    await expect(collectOracleCandidateExperience({
      adapterConfig: { apiHost: 'jobs.example.com', siteNumber: 'CX_1', siteUrl: 'https://jobs.example.com/sites/CX_1' },
    }, { fetchImpl })).rejects.toThrow(/public career host/);
    await expect(collectOracleCandidateExperience({
      adapterConfig: { apiHost: 'ecsr.fa.us2.oraclecloud.com', siteNumber: 'DEFAULT', siteUrl: 'https://ecsr.fa.us2.oraclecloud.com/sites/DEFAULT' },
    }, { fetchImpl })).rejects.toThrow(/site number/);
  });

  test('reads a site number from a Candidate Experience URL and leaves a bare Oracle host unsupported', () => {
    const board = boardFromUrl('https://ejof.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/jobs');
    expect(board.connectorStatus).toBe('supported');
    expect(board.adapterType).toBe('oracle-candidate-experience');
    expect(board.boardIdentifier).toBe('CX');
    expect(board.apiHost).toBe('ejof.fa.us2.oraclecloud.com');
    const bare = boardFromUrl('https://efhc.fa.ca2.oraclecloud.com/');
    expect(bare.connectorStatus).toBe('unsupported');
    expect(bare.boardIdentifier).toBe('');
  });

  test('updates an existing unsupported catalog source when the reader is enabled', () => {
    const board = byName.get('Baylor University');
    expect(catalogNeedsSync({
      adapterType: 'public-search',
      status: 'unsupported',
      adapterConfig: { provider: 'baylor-university' },
    }, board)).toBe(true);
    expect(catalogNeedsSync({
      adapterType: 'oracle-candidate-experience',
      status: 'enabled',
      adapterConfig: board.adapterConfig,
    }, board)).toBe(false);
    expect(isDue({
      status: 'enabled',
      adapterType: 'oracle-candidate-experience',
      nextAttemptAt: null,
    }, new Date('2026-11-12T12:00:00Z'))).toBe(true);
    expect(isDue({
      status: 'unsupported',
      adapterType: 'oracle-candidate-experience',
      nextAttemptAt: null,
    }, new Date('2026-11-12T12:00:00Z'))).toBe(false);
  });
});
