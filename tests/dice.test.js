const { mapDiceJob, collectDice } = require('../src/services/dice');

function sse(payload) {
  return {
    ok: true,
    status: 200,
    async text() {
      return `event: message\r\ndata: ${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
      })}`;
    },
  };
}

describe('Dice public search', () => {
  test('keeps the posted date and does not invent an application submission', () => {
    const mapped = mapDiceJob({
      guid: 'cf1b75fe-2b6d-4a3b-bc0d-b2fa9ef4edc8',
      title: 'Sr Oracle Cloud HCM Analyst',
      summary: 'Oracle Cloud HCM analyst for Core HR.',
      postedDate: '2026-10-20T00:15:15Z',
      companyName: 'Ledgent Technology',
      employerType: 'Recruiter',
      employmentType: 'Full-time',
      jobLocation: { displayName: 'San Dimas, California, USA' },
      detailsPageUrl: 'https://www.dice.com/job-detail/cf1b75fe-2b6d-4a3b-bc0d-b2fa9ef4edc8?utm_source=example',
      salary: '$120000 - $137000 per annum',
      easyApply: true,
    });
    expect(mapped.publishedAt.toISOString()).toBe('2026-10-20T00:15:15.000Z');
    expect(mapped.employerName).toBe('Ledgent Technology');
    expect(mapped.sourceOwnership).toBe('staffing_company');
    expect(mapped.canonicalUrl).toBe('https://www.dice.com/job-detail/cf1b75fe-2b6d-4a3b-bc0d-b2fa9ef4edc8');
    expect(mapped.easyApply).toBeUndefined();
  });

  test('stops a short search as partial and keeps only Oracle HCM roles', async () => {
    const calls = [];
    const result = await collectDice({
      adapterConfig: { keywords: ['Oracle Cloud HCM'] },
    }, {
      fetchImpl: async (url, init) => {
        calls.push(JSON.parse(init.body).params.arguments.page_number);
        return sse({
          data: [{
            guid: `job-${calls.length}`,
            title: calls.length === 1 ? 'Sr Oracle Cloud HCM Analyst' : 'Java Developer',
            summary: calls.length === 1 ? 'Oracle Cloud HCM Core HR analyst.' : 'Java services.',
            postedDate: '2026-10-20T00:15:15Z',
            companyName: 'Example Co',
            employerType: 'Direct Hire',
            detailsPageUrl: `https://www.dice.com/job-detail/job-${calls.length}`,
          }],
          meta: { currentPage: calls.length, pageCount: 9, pageSize: 1, totalResults: 9 },
        });
      },
      retries: 1,
      sleep: async () => {},
      minIntervalMs: 0,
      maxPages: 1,
    });
    expect(calls).toEqual([1]);
    expect(result.complete).toBe(false);
    expect(result.applyAbsencePolicy).toBe(false);
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].title).toBe('Sr Oracle Cloud HCM Analyst');
    expect(result.listings[0].hiringContext).toBe('direct_client');
  });
});
