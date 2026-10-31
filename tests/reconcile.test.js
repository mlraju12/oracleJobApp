const { reconcileListings, matchesDerived, relationshipOf, scheduleOf } = require('../src/services/reconcile');
const { extractExperience } = require('../src/services/extract');

function listing(overrides) {
  return {
    synthetic: false,
    listingStatus: 'active',
    applicationOpen: 'listed_by_source',
    oracle: { platform: 'oracle_cloud_hcm' },
    employerType: 'unknown',
    employerName: 'Example',
    employmentType: 'unknown',
    engagement: 'unknown',
    workingTime: 'unknown',
    workplace: 'unknown',
    locations: [],
    geography: { status: 'unknown', restrictions: [] },
    publishedAtStatus: 'unknown',
    reviewFlags: [],
    ...overrides,
  };
}

describe('count reconciliation', () => {
  test('splits source-listed active listings into exclusive buckets that add up', () => {
    const docs = [
      listing({ employerName: 'Pico', employerType: 'end_user', workingTime: 'full_time', engagement: 'permanent' }),
      listing({ oracle: { platform: 'mixed' }, employerName: 'Apex', employerType: 'consulting_firm' }),
      listing({ oracle: { platform: 'ebs_only' } }),
      listing({ oracle: { platform: 'peoplesoft_only' } }),
      listing({ oracle: { platform: 'unrelated_oracle' } }),
      listing({ listingStatus: 'removed', applicationOpen: 'absent_after_complete_scan' }),
      listing({
        oracle: { platform: 'oracle_cloud_hcm' },
        reviewFlags: [{ code: 'distinct_requisition_same_url' }],
        workplace: 'on_site',
        locations: [{ label: 'Kochi, India' }],
      }),
    ];
    const summary = reconcileListings(docs, [
      { adapterType: 'greenhouse-job-board', status: 'enabled', lastRunStatus: 'complete', synthetic: false },
      { adapterType: 'public-search', status: 'unsupported', lastRunStatus: 'never', synthetic: false },
    ]);
    expect(summary.sourceListedActive).toBe(6);
    expect(summary.defaultFeed).toBe(3);
    expect(summary.oracleCloudHcm).toBe(2);
    expect(summary.mixed).toBe(1);
    expect(summary.excludedOtherOracleProduct).toBe(2);
    expect(summary.excludedNotCloudHcm).toBe(1);
    expect(summary.excludedNotSourceListed).toBe(1);
    expect(summary.monitoredListings).toBe(7);
    expect(summary.sourceListedActive + summary.excludedNotSourceListed).toBe(summary.monitoredListings);
    expect(summary.defaultFeed + summary.excludedOtherOracleProduct + summary.excludedNotCloudHcm).toBe(summary.sourceListedActive);
    expect(summary.flaggedSeparateRequisitions).toBe(1);
    expect(summary.geography.usa + summary.geography.other).toBe(summary.defaultFeed);
    expect(summary.geography.other).toBe(1);
    expect(summary.endUserEmployers).toBe(1);
    expect(summary.consultingEmployers).toBe(1);
    expect(summary.boards).toBe(2);
    expect(summary.adapters).toBe(2);
    expect(summary.activeMeaning).toMatch(/HTTP 200/);
  });

  test('keeps a missing posted date inside the feed and out of a posted-date filter', () => {
    const undated = listing({ publishedAt: null, publishedAtStatus: 'unknown' });
    expect(matchesDerived(undated, {})).toBe(true);
    expect(matchesDerived(undated, { postedAfter: '2026-01-01' })).toBe(false);
    expect(matchesDerived(listing({ publishedAt: '2026-10-21T00:00:00.000Z', publishedAtStatus: 'published' }), { postedAfter: '2026-10-01', postedBefore: '2026-10-31' })).toBe(true);
  });

  test('does not turn a contract into part-time when only the relationship is stated', () => {
    const contract = listing({ employmentType: 'contract', engagement: 'contract', workingTime: 'unknown' });
    expect(relationshipOf(contract)).toBe('contractor');
    expect(scheduleOf(contract)).toBe('unknown');
  });

  test('leaves a remote job that names another country out of the United States filter', () => {
    const remoteIndia = listing({
      workplace: 'remote',
      locations: [{ label: 'Remote' }],
      geography: { status: 'stated', restrictions: ['Must be located in India'] },
    });
    expect(matchesDerived(remoteIndia, { scope: 'usa' })).toBe(false);
    expect(matchesDerived(remoteIndia, { scope: 'other' })).toBe(true);
  });

  test('filters on stated years and does not treat a seniority word as a year count', () => {
    const fivePlus = listing({ experience: { status: 'published', yearsText: '5+ years', yearsMin: 5, yearsMax: null, seniority: 'senior' } });
    const threeToFive = listing({ experience: { status: 'published', yearsText: '3-5 years' } });
    const seniorOnly = listing({ experience: { status: 'published', yearsText: null, seniority: 'senior' } });
    const unstated = listing({});
    expect(matchesDerived(fivePlus, { experienceMin: '5' })).toBe(true);
    expect(matchesDerived(fivePlus, { experienceMax: '3' })).toBe(false);
    expect(matchesDerived(threeToFive, { experienceMin: '4', experienceMax: '6' })).toBe(true);
    expect(matchesDerived(threeToFive, { experienceMin: '8' })).toBe(false);
    expect(matchesDerived(seniorOnly, { experienceMin: '1' })).toBe(false);
    expect(matchesDerived(unstated, { experienceMax: '10' })).toBe(false);
    expect(matchesDerived(fivePlus, {})).toBe(true);
    const parsed = extractExperience('Senior Analyst', 'At least 8 years of Oracle Cloud HCM. Candidates must be 25 years old.');
    expect(parsed.yearsMin).toBe(8);
    expect(parsed.yearsMax).toBe(null);
    expect(parsed.yearsText).toMatch(/8 years/i);
    const range = extractExperience('Analyst', '3 to 5 years of experience.');
    expect(range.yearsMin).toBe(3);
    expect(range.yearsMax).toBe(5);
  });
});
