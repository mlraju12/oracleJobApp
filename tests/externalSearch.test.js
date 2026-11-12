const { buildExternalSearch, selectedModuleNames, externalSearchesFor } = require('../src/services/externalSearch');

const NOW = new Date('2026-11-02T15:00:00Z');

function search(provider, filters) {
  return buildExternalSearch(provider, filters, NOW);
}

describe('external job-board search', () => {
  test('keeps known module names and drops anything else', () => {
    expect(selectedModuleNames('Payroll, Absence, Not A Module, Payroll')).toEqual(['Payroll', 'Absence']);
    expect(selectedModuleNames('')).toEqual([]);
  });

  test('fills LinkedIn, Indeed, and Glassdoor search URLs and adds no job rows', () => {
    const filters = {
      q: 'payroll',
      location: 'Austin',
      platform: 'oracle_cloud_hcm,mixed',
      module: 'Payroll,Absence',
      workplace: 'remote',
      employmentType: 'full_time',
      postedAfter: '2026-10-28',
      experienceMin: '4',
      experienceMax: '6',
      employerType: 'end_user',
    };
    const linkedin = search('linkedin', filters);
    const indeed = search('indeed', filters);
    const glassdoor = search('glassdoor', filters);
    expect(linkedin.listings).toBeUndefined();
    expect(indeed.listings).toBeUndefined();
    expect(glassdoor.listings).toBeUndefined();

    const linkedinUrl = new URL(linkedin.url);
    expect(linkedinUrl.hostname).toBe('www.linkedin.com');
    expect(linkedinUrl.pathname).toBe('/jobs/search/');
    expect(linkedinUrl.searchParams.get('keywords')).toBe('payroll Oracle Cloud HCM Payroll Absence');
    expect(linkedinUrl.searchParams.get('location')).toBe('Austin');
    expect(linkedinUrl.searchParams.get('f_WT')).toBe('2');
    expect(linkedinUrl.searchParams.get('f_JT')).toBe('F');
    expect(linkedinUrl.searchParams.get('f_TPR')).toBe('r604800');
    expect(linkedinUrl.searchParams.get('f_E')).toBe('4');
    expect(linkedin.message).toMatch(/No LinkedIn rows were added/);
    expect(linkedin.message).toMatch(/employer type/);

    const indeedUrl = new URL(indeed.url);
    expect(indeedUrl.hostname).toBe('www.indeed.com');
    expect(indeedUrl.searchParams.get('q')).toBe('payroll Oracle Cloud HCM Payroll Absence');
    expect(indeedUrl.searchParams.get('l')).toBe('Austin');
    expect(indeedUrl.searchParams.get('sc')).toBe('0kf:attr(DSQF7);');
    expect(indeedUrl.searchParams.get('jt')).toBe('fulltime');
    expect(indeedUrl.searchParams.get('fromage')).toBe('7');
    expect(indeedUrl.searchParams.get('explvl')).toBe('mid_level');
    expect(indeed.message).toMatch(/No Indeed rows were added/);

    const glassdoorUrl = new URL(glassdoor.url);
    expect(glassdoorUrl.hostname).toBe('www.glassdoor.com');
    expect(glassdoorUrl.searchParams.get('sc.keyword')).toBe('payroll Oracle Cloud HCM Payroll Absence');
    expect(glassdoorUrl.searchParams.get('locKeyword')).toBe('Austin');
    expect(glassdoorUrl.searchParams.get('remoteWorkType')).toBe('1');
    expect(glassdoorUrl.searchParams.get('jobType')).toBe('fulltime');
    expect(glassdoorUrl.searchParams.get('fromAge')).toBe('7');
    expect(glassdoorUrl.searchParams.get('seniorityType')).toBe('midseniorlevel');
    expect(glassdoor.message).toMatch(/No Glassdoor rows were added/);
  });

  test('uses United States when that scope is on and no city was typed', () => {
    const linkedin = search('linkedin', { scope: 'usa', workplace: 'hybrid', schedule: 'part_time' });
    const url = new URL(linkedin.url);
    expect(url.searchParams.get('location')).toBe('United States');
    expect(url.searchParams.get('f_WT')).toBe('3');
    expect(url.searchParams.get('f_JT')).toBe('P');
    expect(url.searchParams.get('keywords')).toBeNull();
  });

  test('leaves a wide experience range and an on-site filter off Indeed', () => {
    const indeed = search('indeed', {
      q: 'Oracle HCM',
      workplace: 'on_site',
      experienceMin: '1',
      experienceMax: '15',
      postedAfter: '2026-08-01',
    });
    const url = new URL(indeed.url);
    expect(url.searchParams.get('q')).toBe('Oracle HCM');
    expect(url.searchParams.get('explvl')).toBeNull();
    expect(url.searchParams.get('fromage')).toBeNull();
    expect(url.searchParams.get('sc')).toBeNull();
    expect(indeed.message).toMatch(/on-site workplace/);
    expect(indeed.message).toMatch(/experience years that span more than one level/);
    expect(indeed.message).toMatch(/older than 14 days/);
  });

  test('returns a handoff only for a selected external source', () => {
    const sources = [
      { _id: 'a'.repeat(24), name: 'LinkedIn', adapterType: 'external-search', catalogKey: 'external:linkedin', adapterConfig: { provider: 'linkedin' } },
      { _id: 'b'.repeat(24), name: 'Pico', adapterType: 'greenhouse-job-board', catalogKey: 'greenhouse:pico' },
    ];
    expect(externalSearchesFor(sources, { q: 'payroll' })).toEqual([]);
    const selected = externalSearchesFor(sources, { q: 'payroll', searchSource: 'a'.repeat(24) }, NOW);
    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe('LinkedIn');
    expect(selected[0].url).toContain('keywords=payroll');
    expect(externalSearchesFor(sources, { searchSource: 'b'.repeat(24) }, NOW)).toEqual([]);
  });
});
