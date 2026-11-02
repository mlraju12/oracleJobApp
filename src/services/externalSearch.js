const { MODULES } = require('./classify');

const MODULE_NAMES = new Set(MODULES);

const ROLE_WORDS = {
  functional: 'functional',
  technical: 'technical',
  techno_functional: 'techno-functional',
  payroll_operations: 'payroll operations',
  implementation: 'implementation',
  support: 'support',
  architecture: 'architect',
};

const JOB_LABEL = {
  full_time: 'full-time',
  part_time: 'part-time',
  contract: 'contract',
  temporary: 'temporary',
  internship: 'internship',
};

const PLACE_LABEL = {
  remote: 'remote',
  hybrid: 'hybrid',
  on_site: 'on-site',
};

const LINKEDIN_JOB = { full_time: 'F', part_time: 'P', contract: 'C', temporary: 'T', internship: 'I' };
const INDEED_JOB = { full_time: 'fulltime', part_time: 'parttime', contract: 'contract', temporary: 'temporary', internship: 'internship' };
const GLASSDOOR_JOB = INDEED_JOB;

const LINKEDIN_EXPERIENCE = {
  entry: ['2', 'entry level'],
  mid: ['4', 'mid-senior level'],
  senior: ['4', 'mid-senior level'],
  director: ['5', 'director level'],
};
const INDEED_EXPERIENCE = {
  entry: ['entry_level', 'entry level'],
  mid: ['mid_level', 'mid level'],
  senior: ['senior_level', 'senior level'],
  director: ['senior_level', 'senior level'],
};
const GLASSDOOR_EXPERIENCE = {
  entry: ['entrylevel', 'entry level'],
  mid: ['midseniorlevel', 'mid-senior level'],
  senior: ['midseniorlevel', 'mid-senior level'],
  director: ['director', 'director level'],
};

const SPECS = {
  linkedin: {
    name: 'LinkedIn',
    host: 'www.linkedin.com',
    origin: 'https://www.linkedin.com/jobs/search/',
    fill(params, plan, applied, omitted) {
      if (plan.keyword) params.set('keywords', plan.keyword);
      if (plan.location) params.set('location', plan.location);
      addWorkplace(params, plan, applied, omitted, 'linkedin');
      addJobType(params, plan, applied, 'f_JT', LINKEDIN_JOB);
      addRecency(params, plan, applied, omitted, [
        { days: 1, param: 'f_TPR', value: 'r86400', label: 'the past day' },
        { days: 7, param: 'f_TPR', value: 'r604800', label: 'the past week' },
        { days: 30, param: 'f_TPR', value: 'r2592000', label: 'the past month' },
      ]);
      addExperience(params, plan, applied, omitted, LINKEDIN_EXPERIENCE, 'f_E');
    },
  },
  indeed: {
    name: 'Indeed',
    host: 'www.indeed.com',
    origin: 'https://www.indeed.com/jobs',
    fill(params, plan, applied, omitted) {
      if (plan.keyword) params.set('q', plan.keyword);
      if (plan.location) params.set('l', plan.location);
      addWorkplace(params, plan, applied, omitted, 'indeed');
      addJobType(params, plan, applied, 'jt', INDEED_JOB);
      addRecency(params, plan, applied, omitted, [
        { days: 1, param: 'fromage', value: '1', label: 'the past day' },
        { days: 3, param: 'fromage', value: '3', label: 'the past 3 days' },
        { days: 7, param: 'fromage', value: '7', label: 'the past week' },
        { days: 14, param: 'fromage', value: '14', label: 'the past 14 days' },
      ]);
      addExperience(params, plan, applied, omitted, INDEED_EXPERIENCE, 'explvl');
    },
  },
  glassdoor: {
    name: 'Glassdoor',
    host: 'www.glassdoor.com',
    origin: 'https://www.glassdoor.com/Job/jobs.htm',
    fill(params, plan, applied, omitted) {
      if (plan.keyword) params.set('sc.keyword', plan.keyword);
      if (plan.location) params.set('locKeyword', plan.location);
      addWorkplace(params, plan, applied, omitted, 'glassdoor');
      addJobType(params, plan, applied, 'jobType', GLASSDOOR_JOB);
      addRecency(params, plan, applied, omitted, [
        { days: 1, param: 'fromAge', value: '1', label: 'the past day' },
        { days: 3, param: 'fromAge', value: '3', label: 'the past 3 days' },
        { days: 7, param: 'fromAge', value: '7', label: 'the past week' },
        { days: 14, param: 'fromAge', value: '14', label: 'the past 14 days' },
        { days: 30, param: 'fromAge', value: '30', label: 'the past month' },
      ]);
      addExperience(params, plan, applied, omitted, GLASSDOOR_EXPERIENCE, 'seniorityType');
    },
  },
};

function selectedModuleNames(value) {
  const seen = [];
  for (const part of String(value || '').split(',')) {
    const name = part.trim();
    if (!MODULE_NAMES.has(name) || seen.includes(name)) continue;
    seen.push(name);
  }
  return seen;
}

function platformPhrase(platform) {
  const parts = String(platform || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!parts.length) return '';
  if (parts.every((part) => part === 'ebs_only')) return 'Oracle EBS';
  if (parts.every((part) => part === 'peoplesoft_only')) return 'PeopleSoft';
  if (parts.every((part) => part === 'unrelated_oracle')) return 'Oracle';
  if (parts.some((part) => part === 'oracle_cloud_hcm' || part === 'mixed')) return 'Oracle Cloud HCM';
  if (parts.some((part) => ['ebs_only', 'peoplesoft_only', 'ebs_and_peoplesoft'].includes(part))) return 'Oracle';
  return '';
}

function yearOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 60) return null;
  return number;
}

function buildKeyword(filters, applied) {
  const typed = String(filters.q || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const bits = [];
  const notes = [];
  if (typed) bits.push(typed);
  const phrase = platformPhrase(filters.platform);
  if (phrase && !/\boracle\b|\bpeoplesoft\b|\bebs\b|\be-?business\b/i.test(typed)) {
    bits.push(phrase);
    notes.push(`platform ${phrase} added to the keyword`);
  }
  const modules = selectedModuleNames(filters.module);
  if (modules.length) {
    bits.push(modules.join(' '));
    notes.push(`modules ${modules.join(', ')} added to the keyword`);
  }
  const role = ROLE_WORDS[String(filters.roleCategory || '')] || '';
  if (role && !typed.toLowerCase().includes(role)) {
    bits.push(role);
    notes.push(`role ${role} added to the keyword`);
  }
  const keyword = bits.join(' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (keyword) applied.push(`keyword "${keyword}"`);
  applied.push(...notes);
  return keyword;
}

function buildLocation(filters, applied, omitted) {
  const typed = String(filters.location || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (typed) {
    applied.push(`location ${typed}`);
    return typed;
  }
  if (filters.scope === 'usa') {
    applied.push('location United States');
    return 'United States';
  }
  if (filters.scope === 'other') omitted.push('other countries, because this site needs a place name');
  return '';
}

function jobTypeChoice(filters) {
  const signals = [];
  function add(value, label) {
    if (!value) return;
    signals.push({ value, label });
  }
  const employment = {
    full_time: 'full_time',
    part_time: 'part_time',
    contract: 'contract',
    contract_to_hire: 'contract',
    temporary: 'temporary',
    project_based: 'contract',
  }[filters.employmentType];
  const engagement = {
    permanent: 'full_time',
    contract: 'contract',
    temporary: 'temporary',
    internship: 'internship',
    contract_to_hire: 'contract',
  }[filters.engagement];
  const schedule = { full_time: 'full_time', part_time: 'part_time' }[filters.schedule];
  const relationship = { contractor: 'contract', temporary: 'temporary' }[filters.relationship];
  add(employment, 'employment');
  add(engagement, 'engagement');
  add(schedule, 'schedule');
  add(relationship, 'relationship');
  if (!signals.length) return { value: '', skipped: [] };
  const chosen = signals[0];
  const skipped = [...new Set(signals.slice(1).filter((item) => item.value !== chosen.value).map((item) => item.label))];
  return { value: chosen.value, skipped };
}

function recencyDays(value, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const start = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - start) / 86400000);
  if (days < 0) return null;
  return days;
}

function postedWindow(filters, now, omitted) {
  if (filters.postedBefore) omitted.push('posted-through date');
  if (!filters.postedAfter) return null;
  const days = recencyDays(filters.postedAfter, now);
  if (days == null) {
    omitted.push('posted-from date');
    return null;
  }
  return days;
}

function experiencePlan(filters, omitted) {
  const min = yearOrNull(filters.experienceMin);
  const max = yearOrNull(filters.experienceMax);
  if (min == null && max == null) return '';
  if (min != null && max != null && max < min) {
    omitted.push('experience years');
    return '';
  }
  const low = min == null ? 0 : min;
  const high = max == null ? null : max;
  if ((high == null || high <= 2) && low <= 2) return 'entry';
  if (low >= 12) return 'director';
  if (low >= 6) return 'senior';
  if (low >= 3 && (high == null || high <= 8)) return 'mid';
  omitted.push('experience years that span more than one level');
  return '';
}

function catalogOnly(filters, omitted) {
  if (filters.employerType) omitted.push('employer type');
  if (filters.hiringRelationship) omitted.push('hiring relationship');
  if (String(filters.directEndClient) === 'true') omitted.push('direct end-client');
  if (String(filters.big5) === 'true') omitted.push('the five consulting employers limit');
  if (filters.hiringContext) omitted.push('who is hiring');
  if (filters.discoveredAfter || filters.discoveredBefore) omitted.push('first-discovered dates');
  if (filters.listingStatus && filters.listingStatus !== 'active') omitted.push('listing status');
  if (filters.relationship === 'employee') omitted.push('employee relationship');
}

function searchPlan(filters, now) {
  const applied = [];
  const omitted = [];
  const source = filters && typeof filters === 'object' ? filters : {};
  const keyword = buildKeyword(source, applied);
  const location = buildLocation(source, applied, omitted);
  const job = jobTypeChoice(source);
  if (job.skipped.length) omitted.push(`${job.skipped.join(' and ')}, because another job-type filter was already used`);
  catalogOnly(source, omitted);
  return {
    keyword,
    location,
    workplace: ['remote', 'hybrid', 'on_site'].includes(source.workplace) ? source.workplace : '',
    jobType: job.value,
    recencyDays: postedWindow(source, now, omitted),
    experience: experiencePlan(source, omitted),
    applied,
    omitted,
  };
}

function addWorkplace(params, plan, applied, omitted, mode) {
  if (!plan.workplace) return;
  if (mode === 'linkedin') {
    params.set('f_WT', { remote: '2', hybrid: '3', on_site: '1' }[plan.workplace]);
    applied.push(PLACE_LABEL[plan.workplace]);
    return;
  }
  if (plan.workplace === 'remote') {
    if (mode === 'indeed') params.set('sc', '0kf:attr(DSQF7);');
    if (mode === 'glassdoor') params.set('remoteWorkType', '1');
    applied.push('remote');
    return;
  }
  omitted.push(`${PLACE_LABEL[plan.workplace]} workplace`);
}

function addJobType(params, plan, applied, key, table) {
  const value = table[plan.jobType];
  if (!value) return;
  params.set(key, value);
  applied.push(JOB_LABEL[plan.jobType]);
}

function addRecency(params, plan, applied, omitted, windows) {
  if (plan.recencyDays == null) return;
  const fit = windows.find((window) => plan.recencyDays <= window.days);
  if (!fit) {
    omitted.push(`posted-from date older than ${windows[windows.length - 1].days} days`);
    return;
  }
  params.set(fit.param, fit.value);
  applied.push(`posted in ${fit.label}`);
}

function addExperience(params, plan, applied, omitted, table, key) {
  if (!plan.experience) return;
  const row = table[plan.experience];
  if (!row) {
    omitted.push('experience years');
    return;
  }
  params.set(key, row[0]);
  applied.push(`experience ${row[1]}`);
}

function handoffMessage(name, applied, omitted) {
  const sent = applied.length
    ? `The public search uses ${applied.join(', ')}.`
    : 'No keyword, location, or job type was entered.';
  const skipped = omitted.length ? ` Left on the Oracle results only: ${omitted.join(', ')}.` : '';
  return `${name} has no job list this server can read without a sign-in or a partner key. No ${name} rows were added. ${sent}${skipped}`;
}

function buildExternalSearch(provider, filters, now = new Date()) {
  const spec = SPECS[provider];
  if (!spec) return null;
  const plan = searchPlan(filters, now);
  const applied = plan.applied.slice();
  const omitted = plan.omitted.slice();
  const params = new URLSearchParams();
  spec.fill(params, plan, applied, omitted);
  const query = params.toString();
  const url = query ? `${spec.origin}?${query}` : spec.origin;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== spec.host) return null;
  return {
    provider,
    name: spec.name,
    url: parsed.toString(),
    message: handoffMessage(spec.name, applied, omitted),
  };
}

function wantedSearchSources(query) {
  return new Set(String((query && query.searchSource) || '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^[a-f0-9]{24}$/i.test(item) || /^external:[a-z0-9-]+$/.test(item)));
}

function externalSearchesFor(sources, query, now = new Date()) {
  const wanted = wantedSearchSources(query);
  if (!wanted.size) return [];
  const searches = [];
  for (const source of sources || []) {
    if (!source || source.adapterType !== 'external-search') continue;
    const id = String(source._id || source.id || '');
    if (!wanted.has(id) && !wanted.has(source.catalogKey || '')) continue;
    const provider = source.adapterConfig && source.adapterConfig.provider;
    const built = buildExternalSearch(provider, query, now);
    if (!built) continue;
    searches.push({
      sourceId: id,
      name: built.name,
      url: built.url,
      message: built.message,
    });
  }
  return searches;
}

module.exports = {
  selectedModuleNames,
  buildExternalSearch,
  externalSearchesFor,
};
