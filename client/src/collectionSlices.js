const DEFAULT_PLATFORM = 'oracle_cloud_hcm,mixed';

const CLEARED_SLICE = {
  platform: DEFAULT_PLATFORM,
  employerType: '',
  hiringRelationship: '',
  relationship: '',
  schedule: '',
  scope: '',
  directEndClient: '',
  engagement: '',
  employmentType: '',
  hiringContext: '',
};

export const SLICES = [
  {
    id: 'oracle_cloud_hcm',
    label: 'Oracle Cloud HCM',
    count: (coverage) => coverage.oracleCloudHcm,
    apply: { platform: 'oracle_cloud_hcm' },
  },
  {
    id: 'mixed',
    label: 'Mixed Cloud with EBS or PeopleSoft',
    count: (coverage) => coverage.mixed,
    apply: { platform: 'mixed' },
  },
  {
    id: 'end_user',
    label: 'End-user employers',
    count: (coverage) => coverage.endUserEmployers,
    apply: { employerType: 'end_user' },
  },
  {
    id: 'consulting',
    label: 'Consulting employers',
    count: (coverage) => coverage.consultingEmployers,
    apply: { employerType: 'consulting_firm' },
  },
  {
    id: 'full_time',
    label: 'Full-time',
    count: (coverage) => coverage.schedule && coverage.schedule.full_time,
    apply: { schedule: 'full_time' },
  },
  {
    id: 'part_time',
    label: 'Part-time',
    count: (coverage) => coverage.schedule && coverage.schedule.part_time,
    apply: { schedule: 'part_time' },
  },
  {
    id: 'contract',
    label: 'Contract relationship',
    count: (coverage) => coverage.relationship && coverage.relationship.contractor,
    apply: { relationship: 'contractor' },
  },
  {
    id: 'schedule_unknown',
    label: 'Schedule not stated',
    count: (coverage) => coverage.schedule && coverage.schedule.unknown,
    apply: { schedule: 'unknown' },
  },
  {
    id: 'usa',
    label: 'United States scope',
    count: (coverage) => coverage.geography && coverage.geography.usa,
    apply: { scope: 'usa' },
  },
  {
    id: 'other',
    label: 'Other countries',
    count: (coverage) => coverage.geography && coverage.geography.other,
    apply: { scope: 'other' },
  },
];

function fieldValue(filters, key) {
  const value = filters ? filters[key] : '';
  if (key === 'directEndClient') return value === true || value === 'true' ? 'true' : '';
  return value == null ? '' : String(value);
}

function matchesSlice(filters, apply) {
  const merged = { ...CLEARED_SLICE, ...apply };
  return Object.keys(CLEARED_SLICE).every((key) => fieldValue(filters, key) === String(merged[key] || ''));
}

export function activeSlice(filters) {
  return SLICES.find((slice) => matchesSlice(filters, slice.apply)) || null;
}

export function clearSlice(filters) {
  return { ...(filters || {}), ...CLEARED_SLICE };
}

export function applySlice(filters, sliceId) {
  const slice = SLICES.find((item) => item.id === sliceId);
  if (!slice) return filters;
  const current = activeSlice(filters);
  if (current && current.id === slice.id) return clearSlice(filters);
  return { ...(filters || {}), ...CLEARED_SLICE, ...slice.apply };
}

export function shouldGroupByCompany(filters) {
  if (fieldValue(filters, 'relationship') === 'contractor') return true;
  const platform = fieldValue(filters, 'platform');
  if (platform !== DEFAULT_PLATFORM && platform !== '') return false;
  return Object.keys(CLEARED_SLICE)
    .filter((key) => key !== 'platform')
    .every((key) => fieldValue(filters, key) === String(CLEARED_SLICE[key] || ''));
}

export function groupByCompany(opportunities) {
  const groups = [];
  const index = new Map();
  for (const opportunity of opportunities || []) {
    const raw = opportunity && opportunity.employerName != null ? String(opportunity.employerName).trim() : '';
    const name = raw || 'Employer not stated';
    const key = name.toLocaleLowerCase();
    let group = index.get(key);
    if (!group) {
      group = { key, name, jobs: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.jobs.push(opportunity);
  }
  return groups;
}
