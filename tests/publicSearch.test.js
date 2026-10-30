const { rssItems, mapPwcJobs, collectPublicSearch } = require('../src/services/publicSearch');

function htmlBody(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return body;
    },
  };
}

describe('public career parsers', () => {
  test('reads Deloitte RSS items and ignores an empty description gap', () => {
    const items = rssItems(`
      <rss><channel>
        <item>
          <title>Oracle HCM Cloud Core HR Analyst</title>
          <link>https://apply.deloitte.com/en_US/careers/JobDetail/Oracle-HCM-Cloud-Core-HR-Analyst/362486</link>
          <description><![CDATA[<p>Full-time Oracle Cloud HCM Core HR analyst.</p>]]></description>
        </item>
      </channel></rss>
    `);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Oracle HCM Cloud Core HR Analyst');
    expect(items[0].description).toMatch(/Full-time Oracle Cloud HCM Core HR analyst/);
    expect(items[0].description).not.toMatch(/<p>/);
  });

  test('maps the embedded PwC page and stays incomplete when totalHits is larger', async () => {
    const html = `
      <script>
        eagerLoadRefineSearch = {"totalHits":28,"jobs":[{"applyUrl":"https://pwc.wd3.myworkdayjobs.com/US_Experienced_Careers/job/GA-Atlanta/Oracle-HCM-Director_745765WD?source=US_EXP_Careers","descriptionTeaser":"Oracle HCM director for Core HR.","type":"Full time","ml_skills":["do not store"]}]}
      </script>
    `;
    const mapped = mapPwcJobs(html);
    expect(mapped.totalHits).toBe(28);
    expect(mapped.listings).toHaveLength(1);
    expect(mapped.listings[0].sourceJobId).toBe('745765WD');
    expect(mapped.listings[0].title).toBe('Oracle HCM Director');
    expect(mapped.listings[0].descriptionText).toBe('Oracle HCM director for Core HR.');
    expect(mapped.listings[0].locations[0].label).toBe('Atlanta, GA');
    expect(JSON.stringify(mapped.listings[0])).not.toMatch(/do not store/);

    const result = await collectPublicSearch({
      adapterConfig: { provider: 'pwc', searchUrl: 'https://jobs-us.pwc.com/us/en/search-results?keywords=Oracle%20HCM' },
    }, {
      fetchImpl: async () => htmlBody(html),
      retries: 1,
      backoffMs: 0,
      sleep: async () => {},
      minIntervalMs: 0,
    });
    expect(result.complete).toBe(false);
    expect(result.applyAbsencePolicy).toBe(false);
    expect(result.listings).toHaveLength(1);
  });

  test('keeps an EY page partial when startrow links remain past the page cap', async () => {
    const search = `
      <a href="/ey/job/Oracle-Fusion-HCM-Consultant/555001/">Oracle Fusion HCM</a>
      <a href="/ey/search/?q=Oracle%20Cloud%20HCM&amp;startrow=25">Next</a>
    `;
    const job = '<html><title>Oracle Fusion HCM Consultant - EY</title><body>Full-time Oracle Cloud HCM consultant.</body></html>';
    const result = await collectPublicSearch({
      adapterConfig: { provider: 'ey', searchUrl: 'https://careers.ey.com/ey/search/?q=Oracle%20Cloud%20HCM&startrow=0' },
    }, {
      fetchImpl: async (url) => htmlBody(String(url).includes('/ey/job/') ? job : search),
      retries: 1,
      backoffMs: 0,
      sleep: async () => {},
      minIntervalMs: 0,
      maxPages: 1,
      detailCap: 5,
    });
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].sourceJobId).toBe('555001');
    expect(result.listings[0].title).toBe('Oracle Fusion HCM Consultant');
    expect(result.complete).toBe(false);
    expect(result.applyAbsencePolicy).toBe(false);
  });

  test('reads a Deloitte search page together with its feed', async () => {
    const page = '<a href="/en_US/careers/JobDetail/Oracle-HCM-Cloud-Core-HR-Analyst/362486">role</a>';
    const feed = `
      <item>
        <title>Oracle HCM Cloud Core HR Analyst</title>
        <link>https://apply.deloitte.com/en_US/careers/JobDetail/Oracle-HCM-Cloud-Core-HR-Analyst/362486</link>
        <description>Full-time Oracle Cloud HCM Core HR analyst. Configure Core HR, assignments, and workforce structures for a public-sector practice. This description is long enough to stand in for the job page.</description>
      </item>
    `;
    const result = await collectPublicSearch({
      adapterConfig: {
        provider: 'deloitte',
        searchUrl: 'https://apply.deloitte.com/en_US/careers/SearchJobs/Oracle%20Cloud%20HCM',
        feedUrl: 'https://apply.deloitte.com/en_US/careers/SearchJobs/Oracle%20Cloud%20HCM/feed/?jobRecordsPerPage=10',
      },
    }, {
      fetchImpl: async (url) => htmlBody(String(url).includes('/feed/') ? feed : page),
      retries: 1,
      backoffMs: 0,
      sleep: async () => {},
      minIntervalMs: 0,
      maxPages: 2,
    });
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].sourceJobId).toBe('362486');
    expect(result.listings[0].descriptionText).toMatch(/Core HR analyst/);
    expect(result.complete).toBe(true);
  });

  test('refuses an unsupported Big 5 provider', async () => {
    await expect(collectPublicSearch({ adapterConfig: { provider: 'kpmg' } }, {})).rejects.toThrow(/no documented public job feed/);
  });
});
