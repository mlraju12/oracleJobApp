const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadSlices() {
  const source = fs.readFileSync(path.join(__dirname, '../client/src/collectionSlices.js'), 'utf8')
    .replace(/^export function /gm, 'function ')
    .replace(/^export const /gm, 'const ');
  const module = { exports: {} };
  vm.runInNewContext(
    `${source}\nmodule.exports = { SLICES, activeSlice, applySlice, clearSlice, shouldGroupByCompany, groupByCompany };`,
    { module, exports: module.exports },
  );
  return module.exports;
}

const DEFAULTS = {
  q: 'payroll',
  platform: 'oracle_cloud_hcm,mixed',
  listingStatus: 'active',
  employerType: '',
  hiringRelationship: '',
  relationship: '',
  schedule: '',
  scope: '',
  directEndClient: '',
  engagement: '',
  employmentType: '',
  hiringContext: '',
  location: 'Austin',
};

describe('collection summary slices', () => {
  const slices = loadSlices();

  test('turns each segregation count into one slice and leaves the list unfiltered until a count is chosen', () => {
    expect(slices.SLICES.map((slice) => slice.label)).toEqual([
      'Oracle Cloud HCM',
      'Mixed Cloud with EBS or PeopleSoft',
      'End-user employers',
      'Consulting employers',
      'Full-time',
      'Part-time',
      'Contract relationship',
      'Schedule not stated',
      'United States scope',
      'Other countries',
    ]);
    expect(slices.activeSlice(DEFAULTS)).toBeNull();
    expect(slices.shouldGroupByCompany(DEFAULTS)).toBe(true);
  });

  test('clicking Contract relationship keeps only contractor jobs, and clicking it again restores the list', () => {
    const contract = slices.applySlice(DEFAULTS, 'contract');
    expect(contract.relationship).toBe('contractor');
    expect(contract.platform).toBe('oracle_cloud_hcm,mixed');
    expect(contract.schedule).toBe('');
    expect(contract.q).toBe('payroll');
    expect(contract.location).toBe('Austin');
    expect(slices.activeSlice(contract).id).toBe('contract');
    expect(slices.shouldGroupByCompany(contract)).toBe(true);

    const restored = slices.applySlice(contract, 'contract');
    expect(restored.relationship).toBe('');
    expect(restored.platform).toBe('oracle_cloud_hcm,mixed');
    expect(slices.activeSlice(restored)).toBeNull();
    expect(slices.shouldGroupByCompany(restored)).toBe(true);
  });

  test('each other count filters to that slice and stays selected until cleared', () => {
    const cases = [
      ['oracle_cloud_hcm', { platform: 'oracle_cloud_hcm' }],
      ['mixed', { platform: 'mixed' }],
      ['end_user', { employerType: 'end_user' }],
      ['consulting', { employerType: 'consulting_firm' }],
      ['full_time', { schedule: 'full_time' }],
      ['part_time', { schedule: 'part_time' }],
      ['schedule_unknown', { schedule: 'unknown' }],
      ['usa', { scope: 'usa' }],
      ['other', { scope: 'other' }],
    ];
    for (const [id, expected] of cases) {
      const next = slices.applySlice({ ...DEFAULTS, employmentType: 'contract', directEndClient: 'true' }, id);
      expect(slices.activeSlice(next).id).toBe(id);
      expect(next.employmentType).toBe('');
      expect(next.directEndClient).toBe('');
      expect(next.q).toBe('payroll');
      Object.entries(expected).forEach(([key, value]) => expect(next[key]).toBe(value));
      expect(slices.shouldGroupByCompany(next)).toBe(false);
      expect(slices.activeSlice(slices.clearSlice(next))).toBeNull();
    }
  });

  test('switching counts replaces the previous slice', () => {
    const fullTime = slices.applySlice(slices.applySlice(DEFAULTS, 'usa'), 'full_time');
    expect(fullTime.scope).toBe('');
    expect(fullTime.schedule).toBe('full_time');
    expect(slices.activeSlice(fullTime).id).toBe('full_time');
  });

  test('groups jobs by company in list order and keeps every row', () => {
    const groups = slices.groupByCompany([
      { id: '1', employerName: 'Pico' },
      { id: '2', employerName: 'Apex Consulting' },
      { id: '3', employerName: 'pico' },
      { id: '4', employerName: '  ' },
      { id: '5', employerName: '' },
    ]);
    expect(groups.map((group) => [group.name, group.jobs.map((job) => job.id)])).toEqual([
      ['Pico', ['1', '3']],
      ['Apex Consulting', ['2']],
      ['Employer not stated', ['4', '5']],
    ]);
  });
});
