export const ENGAGEMENT = [
  ['', 'Any engagement'],
  ['permanent', 'Permanent'],
  ['contract', 'Contract'],
  ['temporary', 'Temporary'],
  ['internship', 'Internship'],
  ['contract_to_hire', 'Contract-to-hire'],
  ['unknown', 'Not stated'],
];

export const EMPLOYMENT = [
  ['', 'Any employment type'],
  ['full_time', 'Full-time'],
  ['part_time', 'Part-time'],
  ['contract', 'Contract'],
  ['contract_to_hire', 'Contract-to-hire'],
  ['temporary', 'Temporary'],
  ['project_based', 'Project-based'],
  ['unknown', 'Not stated'],
];

export const ROLES = [
  ['', 'Any role'],
  ['functional', 'Functional'],
  ['technical', 'Technical'],
  ['techno_functional', 'Techno-functional'],
  ['payroll_operations', 'Payroll operations'],
  ['implementation', 'Implementation'],
  ['support', 'Support / managed services'],
  ['architecture', 'Architecture and project leadership'],
  ['unknown', 'Not stated'],
];

export const PLATFORMS = [
  ['oracle_cloud_hcm,mixed', 'Oracle Cloud HCM and mixed'],
  ['oracle_cloud_hcm', 'Oracle Cloud HCM'],
  ['mixed', 'Mixed platform'],
  ['ebs_only', 'EBS only'],
  ['peoplesoft_only', 'PeopleSoft only'],
  ['unrelated_oracle', 'Unrelated Oracle'],
  ['', 'All platforms'],
];

export const MODULES = [
  '',
  'Core HR',
  'Payroll',
  'Absence',
  'Time and Labor',
  'Benefits',
  'Compensation',
  'Recruiting',
  'Learning',
  'Talent',
  'Security',
  'Integrations',
  'HDL',
  'HCM Extracts',
  'BI Publisher',
  'Fast Formulas',
  'Journeys',
];

export const PERSONAL = [
  ['saved', 'Saved'],
  ['interested', 'Interested'],
  ['contacting_offline', 'Contacting on my own'],
  ['interviewing', 'Interviewing'],
  ['not_pursuing', 'Not pursuing'],
];

const ENGAGEMENT_LABEL = Object.fromEntries(ENGAGEMENT.filter(([value]) => value).map(([value, label]) => [value, label]));
const EMPLOYMENT_LABEL = Object.fromEntries(EMPLOYMENT.filter(([value]) => value).map(([value, label]) => [value, label]));
const ROLE_LABEL = Object.fromEntries(ROLES.filter(([value]) => value).map(([value, label]) => [value, label]));

export function employmentLabel(value) {
  return EMPLOYMENT_LABEL[value] || 'Not stated';
}

export function engagementLabel(value) {
  return ENGAGEMENT_LABEL[value] || 'Not stated';
}

export const EMPLOYER_TYPES = [
  ['', 'All employer types'],
  ['end_user', 'End-user organizations'],
  ['consulting_firm', 'Consulting firms'],
  ['staffing_agency', 'Staffing agencies'],
];

export const HIRING_RELATIONSHIPS = [
  ['', 'All hiring relationships'],
  ['own_team', 'Direct employer postings'],
  ['named_client', 'Named client'],
  ['undisclosed_client', 'Undisclosed client'],
  ['unknown', 'Relationship not stated'],
];

const EMPLOYER_TYPE_LABEL = Object.fromEntries(EMPLOYER_TYPES.filter(([value]) => value).map(([value, label]) => [value, label]));
const HIRING_RELATIONSHIP_LABEL = Object.fromEntries(HIRING_RELATIONSHIPS.filter(([value]) => value).map(([value, label]) => [value, label]));

export function employerTypeLabel(value) {
  return EMPLOYER_TYPE_LABEL[value] || 'Unknown';
}

export function hiringRelationshipLabel(value) {
  if (value === 'own_team') return 'Hiring for its own team';
  if (value === 'named_client') return 'Hiring for a named client';
  if (value === 'undisclosed_client') return 'Hiring for an undisclosed client';
  return 'Unknown';
}

export function applicationOpenLabel(value) {
  if (value === 'listed_by_source') return 'Listed by the source';
  if (value === 'absent_after_complete_scan') return 'Missing after a complete scan';
  return 'Not established';
}

export function ownershipLabel(value) {
  if (value === 'staffing_company') return 'Staffing advertiser';
  if (value === 'direct_employer') return 'Direct employer';
  return 'Source not classified';
}

export function roleLabel(value) {
  return ROLE_LABEL[value] || 'Not stated';
}

export function platformLabel(value) {
  const found = PLATFORMS.find(([id]) => id === value);
  if (found) return found[1];
  if (value === 'ebs_and_peoplesoft') return 'EBS and PeopleSoft';
  if (value === 'unrelated') return 'Unrelated';
  return value || 'Unknown';
}

export function workplaceLabel(value) {
  if (value === 'remote') return 'Remote';
  if (value === 'hybrid') return 'Hybrid';
  if (value === 'on_site') return 'On-site';
  return 'Not stated';
}

export function when(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
}

export function published(opportunity) {
  if (!opportunity || opportunity.publishedAtStatus !== 'published' || !opportunity.publishedAt) {
    return 'Not provided by the source';
  }
  const date = new Date(opportunity.publishedAt);
  if (Number.isNaN(date.getTime())) return 'Not provided by the source';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function money(compensation) {
  if (!compensation || compensation.status !== 'published') return 'Not published';
  const amount = (value) => (value == null ? null : Number(value).toLocaleString());
  const range = [amount(compensation.min), amount(compensation.max)].filter(Boolean).join(' – ');
  const period = compensation.payPeriod ? ` / ${compensation.payPeriod}` : '';
  const currency = compensation.currency ? `${compensation.currency} ` : '';
  return `${currency}${range || compensation.raw || 'Amount published'}${period}`.trim();
}

export function hours(schedule) {
  if (!schedule || schedule.status !== 'published') return 'Not published';
  if (schedule.hoursPerWeek != null) return `${schedule.publishedText} (${schedule.hoursPerWeek} hours/week)`;
  return schedule.publishedText || 'Not published';
}
