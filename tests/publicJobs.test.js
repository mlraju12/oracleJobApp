const { collectPublicJobFeed } = require('../src/services/publicJobs');
const { collectSource } = require('../src/services/adapters');

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

describe('public job feeds', () => {
  test('reads Himalayas pages, keeps Oracle HCM, and ignores a blank salary', async () => {
    const pages = [];
    const result = await collectPublicJobFeed({
      adapterType: 'public-job-feed',
      adapterConfig: { provider: 'himalayas', query: 'Oracle HCM', maxPages: 15 },
    }, {
      sleep: async () => {},
      fetchImpl: async (url) => {
        pages.push(String(url));
        if (String(url).includes('page=1')) {
          return jsonResponse({
            totalCount: 4,
            offset: 0,
            limit: 20,
            jobs: [
              {
                title: 'Oracle Cloud HCM Expert',
                description: '<p>Oracle Cloud HCM Core HR and Absence.</p>',
                companyName: 'Cronos Europa',
                employmentType: 'Full Time',
                minSalary: null,
                maxSalary: null,
                salaryPeriod: 'annual',
                currency: null,
                locationRestrictions: ['Luxembourg'],
                pubDate: 1789346457,
                applicationLink: 'https://himalayas.app/companies/cronos/jobs/oracle-cloud-hcm-expert?utm_source=api',
                guid: 'https://himalayas.app/companies/cronos/jobs/oracle-cloud-hcm-expert',
              },
              {
                title: 'Oracle Cloud HCM Expert',
                description: '<p>Oracle Cloud HCM Core HR and Absence.</p>',
                companyName: 'Cronos Europa',
                guid: 'https://himalayas.app/companies/cronos/jobs/oracle-cloud-hcm-expert',
                applicationLink: 'https://himalayas.app/companies/cronos/jobs/oracle-cloud-hcm-expert',
              },
              {
                title: 'Retail associate',
                description: '<p>Fold shirts.</p>',
                companyName: 'Shop',
                guid: 'https://himalayas.app/companies/shop/jobs/retail',
                applicationLink: 'https://himalayas.app/companies/shop/jobs/retail',
              },
            ],
          });
        }
        return jsonResponse({
          totalCount: 3,
          offset: 2,
          limit: 20,
          jobs: [
            {
              title: 'Oracle Fusion Cloud HCM Analyst',
              description: '<p>Oracle Fusion Cloud HCM payroll.</p>',
              companyName: 'Nayax',
              employmentType: 'Contract',
              minSalary: 100000,
              maxSalary: 120000,
              salaryPeriod: 'annual',
              currency: 'USD',
              locationRestrictions: ['United States'],
              pubDate: '2026-10-02T00:00:00Z',
              applicationLink: 'https://himalayas.app/companies/nayax/jobs/oracle-fusion',
              guid: 'https://himalayas.app/companies/nayax/jobs/oracle-fusion',
            },
          ],
        });
      },
    });
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('himalayas.app/jobs/api/search');
    expect(pages[0]).toContain('page=1');
    expect(result.complete).toBe(true);
    expect(result.applyAbsencePolicy).toBe(true);
    expect(result.listings.map((item) => item.title)).toEqual([
      'Oracle Cloud HCM Expert',
      'Oracle Fusion Cloud HCM Analyst',
    ]);
    expect(result.listings[0].canonicalUrl).toBe('https://himalayas.app/companies/cronos/jobs/oracle-cloud-hcm-expert');
    expect(result.listings[0].compensation).toBeNull();
    expect(result.listings[0].publishedAt.toISOString()).toBe('2026-09-14T00:40:57.000Z');
    expect(result.listings[0].employerType).toBe('unknown');
    expect(result.listings[1].compensation.status).toBe('published');
    expect(result.listings[1].compensation.min).toBe(100000);
    expect(result.listings[1].compensation.payPeriod).toBe('year');
    expect(result.listings[1].employmentType).toBe('Contract');
  });

  test('does not close listings when Himalayas fails or the page cap stops early', async () => {
    const failed = await collectPublicJobFeed({
      adapterConfig: { provider: 'himalayas', query: 'Oracle HCM' },
    }, {
      fetchImpl: async () => jsonResponse({}, 500),
    });
    expect(failed.complete).toBe(false);
    expect(failed.applyAbsencePolicy).toBe(false);

    const capped = await collectPublicJobFeed({
      adapterConfig: { provider: 'himalayas', query: 'Oracle HCM', maxPages: 1 },
    }, {
      maxPages: 1,
      sleep: async () => {},
      fetchImpl: async () => jsonResponse({
        totalCount: 5,
        offset: 0,
        jobs: [{
          title: 'Oracle Cloud HCM Analyst',
          description: 'Oracle Cloud HCM',
          companyName: 'Example',
          guid: 'https://himalayas.app/companies/example/jobs/one',
          applicationLink: 'https://himalayas.app/companies/example/jobs/one',
        }],
      }),
    });
    expect(capped.listings).toHaveLength(1);
    expect(capped.complete).toBe(false);
    expect(capped.applyAbsencePolicy).toBe(false);
  });

  test('reads a complete Jobicy page and leaves a hasMore feed partial', async () => {
    const done = await collectSource({
      adapterType: 'public-job-feed',
      adapterConfig: { provider: 'jobicy', tag: 'oracle' },
    }, {
      fetchImpl: async () => jsonResponse({
        jobCount: 1,
        hasMore: false,
        jobs: [{
          id: 157019,
          url: 'https://jobicy.com/jobs/157019-oracle-cloud',
          jobTitle: 'Oracle Cloud HCM Consultant',
          companyName: 'Ramp',
          jobType: ['Full-Time'],
          jobGeo: 'Canada',
          jobDescription: '<p>Oracle Cloud HCM Core HR.</p>',
          pubDate: '2026-10-28T13:29:49+00:00',
        }],
      }),
    });
    expect(done.complete).toBe(true);
    expect(done.applyAbsencePolicy).toBe(true);
    expect(done.listings).toHaveLength(1);
    expect(done.listings[0].canonicalUrl).toBe('https://jobicy.com/jobs/157019-oracle-cloud');
    expect(done.listings[0].employerName).toBe('Ramp');

    const more = await collectPublicJobFeed({
      adapterConfig: { provider: 'jobicy', tag: 'oracle' },
    }, {
      fetchImpl: async () => jsonResponse({
        hasMore: true,
        nextCursor: 'abc',
        jobs: [{
          id: 1,
          url: 'https://jobicy.com/jobs/1',
          jobTitle: 'Oracle Cloud HCM Analyst',
          companyName: 'Example',
          jobDescription: 'Oracle Cloud HCM',
        }],
      }),
    });
    expect(more.listings).toHaveLength(1);
    expect(more.complete).toBe(false);
    expect(more.applyAbsencePolicy).toBe(false);
  });
});
