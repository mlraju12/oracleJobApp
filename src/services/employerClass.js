const EMPLOYER_TYPES = ['end_user', 'consulting_firm', 'staffing_agency', 'unknown'];
const HIRING_RELATIONSHIPS = ['own_team', 'named_client', 'undisclosed_client', 'unknown'];

function allowed(value, choices) {
  return choices.includes(value) ? value : 'unknown';
}

function classFromSource(source) {
  const hiringContext = (source && source.hiringContext) || 'unknown';
  if (source && source.employerType) {
    return {
      employerType: allowed(source.employerType, EMPLOYER_TYPES),
      hiringRelationship: allowed(source.hiringRelationship, HIRING_RELATIONSHIPS),
      classificationEvidence: source.classificationEvidence || '',
    };
  }
  if (hiringContext === 'direct_client') {
    return {
      employerType: 'end_user',
      hiringRelationship: 'own_team',
      classificationEvidence: 'The posting is on this organization’s own career board. That is the organization hiring for its own team, not an intermediary advertisement.',
    };
  }
  if (hiringContext === 'consulting_firm') {
    return {
      employerType: 'consulting_firm',
      hiringRelationship: 'own_team',
      classificationEvidence: 'The posting is on this consulting firm’s own career board. A firm hiring for its own team is a direct employer posting, not an intermediary advertisement.',
    };
  }
  return {
    employerType: 'unknown',
    hiringRelationship: 'unknown',
    classificationEvidence: source && source.classificationEvidence || '',
  };
}

function classFromDice(employerType) {
  const value = String(employerType || '').toLowerCase();
  if (value.includes('recruiter')) {
    return {
      employerType: 'staffing_agency',
      hiringRelationship: 'unknown',
      hiringContext: 'unknown',
      sourceOwnership: 'staffing_company',
      classificationEvidence: 'Dice labeled the poster Recruiter. The stored fields do not say whether the role is for the agency’s own team or a client.',
    };
  }
  if (value.includes('direct')) {
    return {
      employerType: 'unknown',
      hiringRelationship: 'own_team',
      hiringContext: 'direct_client',
      sourceOwnership: 'direct_employer',
      classificationEvidence: 'Dice labeled the poster Direct Hire. The named company is hiring for its own opening. Dice’s label does not establish whether that company is an end user or a consulting firm.',
    };
  }
  return {
    employerType: 'unknown',
    hiringRelationship: 'unknown',
    hiringContext: 'unknown',
    sourceOwnership: 'unknown',
    classificationEvidence: 'Dice did not label the poster as Direct Hire or Recruiter.',
  };
}

function verificationFrom(basis) {
  if (basis === 'http_response_only') {
    return {
      listingStatus: 'unknown',
      presenceConfidence: 'unverified',
      applicationOpen: 'not_established',
      listingStatusEvidence: {
        basis: 'http_response_only',
        note: 'The page responded. A successful response does not show that applications are open.',
      },
    };
  }
  return {
    listingStatus: 'active',
    presenceConfidence: 'confirmed',
    applicationOpen: 'listed_by_source',
    listingStatusEvidence: {
      basis: 'included_in_source_job_list',
      note: 'The source’s own job list included this requisition. The listing was not marked open because a page returned HTTP 200.',
    },
  };
}

module.exports = {
  EMPLOYER_TYPES,
  HIRING_RELATIONSHIPS,
  classFromSource,
  classFromDice,
  verificationFrom,
};
