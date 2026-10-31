const { classifyOracleHcm } = require('../src/services/classify');
const { greenhouseCandidate, collectAshby, collectSmartRecruiters, collectStructuredPage } = require('../src/services/adapters');
const { boardFromUrl, detectBoard, searchProviderStatus, DISCOVERY_LEADS } = require('../src/services/discovery');
const { assertSafeOutboundUrl, UnsafeUrlError } = require('../src/services/outbound');

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

describe('direct end-client discovery and collection', () => {
  test('counts an attributable end-user batch and does not pad it to 50', () => {
    const endUsers = DISCOVERY_LEADS.filter((lead) => lead.cohort !== 'consulting_board');
    expect(endUsers.length).toBeGreaterThan(20);
    expect(endUsers.length).toBeLessThan(50);
    expect(endUsers.filter((lead) => lead.connectorStatus === 'supported').map((lead) => lead.name)).toEqual(['Pico']);
    expect(DISCOVERY_LEADS.filter((lead) => lead.cohort === 'consulting_board' && lead.connectorStatus === 'supported').length).toBe(6);
    expect(searchProviderStatus().configured).toBe(false);
    expect(searchProviderStatus().missing).toEqual(['DISCOVERY_SEARCH_ENDPOINT', 'DISCOVERY_SEARCH_KEY']);
  });

  test('reads a board identifier from a published URL and rejects a private host', () => {
    expect(boardFromUrl('https://jobs.ashbyhq.com/arclight-consulting/abc').boardIdentifier).toBe('arclight-consulting');
    expect(boardFromUrl('https://jobs.smartrecruiters.com/Nagarro1/123').boardIdentifier).toBe('Nagarro1');
    expect(boardFromUrl('https://intel.wd1.myworkdayjobs.com/External').connectorStatus).toBe('unsupported');
    expect(boardFromUrl('https://intel.wd1.myworkdayjobs.com/External').boardIdentifier).toBe('');
    const fromHtml = detectBoard('https://jobs.example.com/careers', '<a href="https://job-boards.greenhouse.io/exampleco/jobs/1">Jobs</a><a href="http://127.0.0.1/secret">no</a>');
    expect(fromHtml.boardIdentifier).toBe('exampleco');
    expect(fromHtml.platform).toBe('greenhouse');
    expect(() => assertSafeOutboundUrl('http://127.0.0.1/private')).toThrow(UnsafeUrlError);
    expect(() => assertSafeOutboundUrl('http://169.254.169.254/latest')).toThrow(UnsafeUrlError);
    expect(() => assertSafeOutboundUrl('https://10.1.2.3/jobs')).toThrow(UnsafeUrlError);
  });

  test('fetches an HRIS title for detail classification and keeps a full Ashby board', async () => {
    expect(greenhouseCandidate({ title: 'HRIS Analyst', departments: [] })).toBe(true);
    expect(greenhouseCandidate({ title: 'Retail associate', departments: [] })).toBe(false);
    const ashby = await collectAshby({
      adapterConfig: { boardName: 'exampleco', oracleOnly: true },
    }, {
      fetchImpl: async () => jsonResponse({
        jobs: [
          { id: 'hidden', title: 'Oracle Cloud HCM Analyst', isListed: false, descriptionPlain: 'Oracle Cloud HCM' },
          { id: 'open', title: 'Business Systems Analyst', isListed: true, descriptionPlain: 'Oracle Fusion HCM payroll', employmentType: 'FullTime', workplaceType: 'Remote', jobUrl: 'https://jobs.ashbyhq.com/exampleco/open' },
          { id: 'open', title: 'Business Systems Analyst', isListed: true, descriptionPlain: 'Oracle Fusion HCM payroll', jobUrl: 'https://jobs.ashbyhq.com/exampleco/open' },
        ],
      }),
    });
    expect(ashby.complete).toBe(true);
    expect(ashby.applyAbsencePolicy).toBe(true);
    expect(ashby.listings.map((item) => item.sourceJobId)).toEqual(['open']);
    expect(classifyOracleHcm({ title: ashby.listings[0].title, description: ashby.listings[0].descriptionText }).platform).toBe('oracle_cloud_hcm');
  });

  test('paginates SmartRecruiters and does not close listings when the read fails or stops early', async () => {
    const pages = [];
    const result = await collectSmartRecruiters({
      adapterConfig: { companyIdentifier: 'ExampleCo', oracleOnly: true, minIntervalMs: 0 },
    }, {
      pageLimit: 1,
      maxPages: 2,
      detailCap: 80,
      sleep: async () => {},
      fetchImpl: async (url) => {
        pages.push(url);
        if (String(url).includes('offset=0')) {
          return jsonResponse({
            totalFound: 2,
            content: [{ id: 'one', name: 'HRIS Analyst', jobAd: { sections: [{ text: 'Oracle Cloud HCM Core HR' }] } }],
          });
        }
        return jsonResponse({
          totalFound: 2,
          content: [{ id: 'one', name: 'HRIS Analyst', jobAd: { sections: [{ text: 'Oracle Cloud HCM Core HR' }] } }],
        });
      },
    });
    expect(pages).toHaveLength(2);
    expect(result.listings).toHaveLength(1);
    expect(result.complete).toBe(true);
    expect(result.applyAbsencePolicy).toBe(true);

    const failed = await collectSmartRecruiters({
      adapterConfig: { companyIdentifier: 'ExampleCo' },
    }, {
      fetchImpl: async () => jsonResponse({}, 500),
    });
    expect(failed.complete).toBe(false);
    expect(failed.applyAbsencePolicy).toBe(false);

    const capped = await collectSmartRecruiters({
      adapterConfig: { companyIdentifier: 'ExampleCo', oracleOnly: true },
    }, {
      pageLimit: 1,
      maxPages: 1,
      sleep: async () => {},
      fetchImpl: async () => jsonResponse({
        totalFound: 3,
        content: [{ id: 'a', name: 'HR applications support', jobAd: { sections: [{ text: 'Oracle Cloud HCM' }] } }],
      }),
    });
    expect(capped.complete).toBe(false);
    expect(capped.applyAbsencePolicy).toBe(false);
  });

  test('reads JobPosting data from public HTML and does not treat the page as a full snapshot', async () => {
    const html = `<html><head><link rel="next" href="https://jobs.example.com/page-2"></head><body>
      <script type="application/ld+json">{"@type":"JobPosting","title":"HR technology analyst","description":"Oracle Cloud HCM absence","identifier":{"value":"job-9"},"url":"https://jobs.example.com/job-9","employmentType":"FULL_TIME","datePosted":"2026-10-01"}</script>
      </body></html>`;
    let calls = 0;
    const result = await collectStructuredPage({
      careerSiteUrl: 'https://jobs.example.com/search',
      adapterConfig: { pageUrl: 'https://jobs.example.com/search' },
    }, {
      maxPages: 2,
      sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          async text() { return calls === 1 ? html : '<html></html>'; },
        };
      },
    });
    expect(result.listings.map((item) => item.sourceJobId)).toEqual(['job-9']);
    expect(result.applyAbsencePolicy).toBe(false);
    expect(result.pages).toBe(2);
  });
});
