const { buildListingRecord } = require('../src/services/extract');
const { classFromDice, classFromSource, verificationFrom } = require('../src/services/employerClass');

describe('employer type stays separate from hiring relationship', () => {
  test('treats a consulting firm career board as that firm hiring for its own team', () => {
    const result = classFromSource({ hiringContext: 'consulting_firm' });
    expect(result.employerType).toBe('consulting_firm');
    expect(result.hiringRelationship).toBe('own_team');
    expect(result.classificationEvidence).toMatch(/own team/);
  });

  test('does not turn a Dice direct hire into an end user or a recruiter into a named client', () => {
    const direct = classFromDice('Direct Hire');
    expect(direct.employerType).toBe('unknown');
    expect(direct.hiringRelationship).toBe('own_team');
    expect(direct.sourceOwnership).toBe('direct_employer');
    const recruiter = classFromDice('Recruiter');
    expect(recruiter.employerType).toBe('staffing_agency');
    expect(recruiter.hiringRelationship).toBe('unknown');
    expect(recruiter.sourceOwnership).toBe('staffing_company');
  });
});

describe('open applications and published dates', () => {
  test('does not treat an HTTP response as evidence that applications are open', () => {
    const page = verificationFrom('http_response_only');
    expect(page.listingStatus).toBe('unknown');
    expect(page.applicationOpen).toBe('not_established');
    const listed = verificationFrom('source_job_list');
    expect(listed.listingStatus).toBe('active');
    expect(listed.applicationOpen).toBe('listed_by_source');
    expect(listed.listingStatusEvidence.note).toMatch(/HTTP 200/);
  });

  test('leaves the published date unknown when the posting does not provide one', () => {
    const listing = buildListingRecord({
      sourceJobId: 'no-date',
      title: 'Oracle Cloud HCM consultant',
      descriptionText: 'Full-time Oracle Cloud HCM consultant for Core HR.',
      canonicalUrl: 'https://jobs.example/no-date',
    });
    expect(listing.publishedAt).toBeNull();
    expect(listing.publishedAtStatus).toBe('unknown');
  });

  test('keeps a source-provided date', () => {
    const listing = buildListingRecord({
      sourceJobId: 'dated',
      title: 'Oracle Cloud HCM consultant',
      descriptionText: 'Oracle Cloud HCM consultant.',
      publishedAt: new Date('2026-10-21T00:00:00Z'),
    });
    expect(listing.publishedAt.toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(listing.publishedAtStatus).toBe('published');
  });
});
