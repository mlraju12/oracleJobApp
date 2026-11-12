const { PUBLIC_BOARDS } = require('../src/services/catalog');

const QUERYABLE = {
  'Jade Global': ['smartrecruiters-postings', 'JadeGlobal'],
  'Sierra-Cedar': ['smartrecruiters-postings', 'Sierra-Cedar1'],
  Nagarro: ['smartrecruiters-postings', 'Nagarro1'],
  'SpikeIT Global Solutions': ['smartrecruiters-postings', 'SpikeITGlobalSolutionsInc'],
  'NCS Australia': ['smartrecruiters-postings', 'NCSAustralia'],
  'ArcLight Consulting': ['ashby-job-board', 'arclight-consulting'],
  'BearingPoint Ireland': ['greenhouse-job-board', 'bearingpoint'],
};

const UNSUPPORTED = [
  'Cognizant',
  'Infovity',
  'Huron',
  'Tata Consultancy Services',
  'Infosys',
  'Wipro',
  'Capgemini',
  'IBM',
  'DXC Technology',
  'NTT DATA',
  'HCLTech',
  'Tech Mahindra',
  'LTIMindtree',
  'Hexaware',
  'Mastek',
  'Birlasoft',
  'Datavail',
  'Apps Associates',
];

describe('consulting employer sources', () => {
  const byName = new Map(PUBLIC_BOARDS.map((board) => [board.name, board]));

  test('registers queryable career boards and leaves unsupported boards uncollected', () => {
    for (const [name, [adapterType, identifier]] of Object.entries(QUERYABLE)) {
      const board = byName.get(name);
      expect(board).toBeTruthy();
      expect(board.adapterType).toBe(adapterType);
      expect(board.status || 'enabled').toBe('enabled');
      expect(board.hiringContext).toBe('consulting_firm');
      const config = board.adapterConfig;
      expect(config.oracleOnly).toBe(true);
      expect(config.companyIdentifier || config.boardName || config.boardToken).toBe(identifier);
    }
    for (const [name, host, site] of [
      ['Argano', 'fa-eyau-saasfaprod1.fa.ocs.oraclecloud.com', 'CX_1'],
      ['Inoapps', 'hza.fa.us1.oraclecloud.com', 'CX_2024'],
    ]) {
      const board = byName.get(name);
      expect(board.adapterType).toBe('oracle-candidate-experience');
      expect(board.status || 'enabled').toBe('enabled');
      expect(board.hiringContext).toBe('consulting_firm');
      expect(board.adapterConfig.apiHost).toBe(host);
      expect(board.adapterConfig.siteNumber).toBe(site);
      expect(board.adapterConfig.listings).toBeUndefined();
    }
    for (const name of UNSUPPORTED) {
      const board = byName.get(name);
      expect(board).toBeTruthy();
      expect(board.adapterType).toBe('public-search');
      expect(board.status).toBe('unsupported');
      expect(board.hiringContext).toBe('consulting_firm');
    }
  });

  test('does not invent a Bear source or reuse the Thornbury Greenhouse board as TCS', () => {
    expect(PUBLIC_BOARDS.some((board) => board.name === 'Bear')).toBe(false);
    expect(PUBLIC_BOARDS.some((board) => board.adapterConfig && board.adapterConfig.boardToken === 'tcs')).toBe(false);
    const keys = PUBLIC_BOARDS.map((board) => board.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
