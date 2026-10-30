const { collapse, htmlToText, keepLines, sha256 } = require('./text');
const { classifyOracleHcm } = require('./classify');

const EMPLOYMENT_RULES = [
  ['contract_to_hire', /\b(contract[-\s]?to[-\s]?hire|c2h)\b/i],
  ['part_time', /\bpart[-\s]?time\b/i],
  ['full_time', /\bfull[-\s]?time\b/i],
  ['temporary', /\btemporary(?:\s+(?:assignment|role|position))?\b|\btemp\s+(?:role|position|assignment)\b/i],
  ['project_based', /\bproject[-\s]?based\b/i],
  ['contract', /\b(?:independent contractor|contractor|contract(?![-\s]?to[-\s]?hire)(?:\s+(?:position|role|engagement))?)\b/i],
];

const SCHEMA_EMPLOYMENT = {
  FULL_TIME: 'full_time',
  PART_TIME: 'part_time',
  CONTRACTOR: 'contract',
  TEMPORARY: 'temporary',
};

const INSTRUCTION_PATTERNS = [
  /ignore (?:all |any )?(?:previous|prior) instructions/i,
  /\bsystem prompt\b/i,
  /\byou are now\b/i,
  /"tool"\s*:/i,
  /<script\b/i,
  /\bdelete all (?:listings|tenants|sources|jobs)\b/i,
];

function unknownSchedule() {
  return { status: 'unknown', publishedText: null, hoursPerWeek: null };
}

function unknownCompensation() {
  return { status: 'unknown', min: null, max: null, currency: null, payPeriod: null, raw: null };
}

function unknownSkills() {
  return { status: 'unknown', required: [], preferred: [] };
}

function unknownExperience() {
  return { status: 'unknown', yearsText: null, seniority: null };
}

function unknownAuthorization() {
  return { status: 'unknown', stance: null, excerpt: null };
}

function extractEmployment(text) {
  const found = [];
  for (const [type, pattern] of EMPLOYMENT_RULES) {
    const match = String(text || '').match(pattern);
    if (match) found.push({ type, excerpt: collapse(match[0]) });
  }
  const unique = [...new Map(found.map((item) => [item.type, item])).values()];
  if (unique.length === 1) {
    return { employmentType: unique[0].type, excerpt: unique[0].excerpt, conflicting: false };
  }
  if (unique.length > 1) {
    return { employmentType: 'unknown', excerpt: unique.map((item) => item.excerpt).join('; '), conflicting: true };
  }
  return { employmentType: 'unknown', excerpt: null, conflicting: false };
}

function deriveEngagement(text, employmentType) {
  const source = String(text || '');
  if (/\bintern(?:ship)?\b/i.test(source)) return 'internship';
  if (employmentType === 'contract_to_hire') return 'contract_to_hire';
  if (employmentType === 'temporary') return 'temporary';
  if (employmentType === 'contract') return 'contract';
  if (/\b(permanent|salaried|regular employee)\b/i.test(source)) return 'permanent';
  return 'unknown';
}

function deriveWorkingTime(text, employmentType, schedule) {
  const source = String(text || '');
  if (employmentType === 'part_time' || /\bpart[-\s]?time\b/i.test(source)) return 'part_time';
  if (employmentType === 'full_time' || /\bfull[-\s]?time\b/i.test(source)) return 'full_time';
  if (schedule && schedule.status === 'published' && schedule.hoursPerWeek) return 'stated_hours';
  return 'unknown';
}

function extractHours(text) {
  const source = String(text || '');
  const hours = source.match(/\b(\d{1,2}(?:\.\d)?)\s*(?:hours|hrs)\s*(?:per|a|\/)\s*week\b/i);
  const schedule = source.match(/\b(?:monday|mon)[^.\n]{0,40}(?:friday|fri)\b|\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)[^.\n]{0,24}\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)\b/i);
  if (!hours && !schedule) return unknownSchedule();
  return {
    status: 'published',
    publishedText: collapse((hours && hours[0]) || schedule[0]),
    hoursPerWeek: hours ? Number(hours[1]) : null,
  };
}

function payPeriodFrom(snippet) {
  const text = String(snippet || '');
  if (/\b(?:per|a|\/)\s*(?:year|yr|annum)\b|\bannually\b|\bannual(?:ly)? salary\b|\bsalary\b/i.test(text) && /\b(?:per|a|\/)\s*(?:year|yr|annum)\b|\bannually\b|\bannual\b/i.test(text)) {
    return 'year';
  }
  if (/\b(?:per|a|\/)\s*(?:hour|hr)\b|\bhourly\b/i.test(text)) return 'hour';
  if (/\b(?:per|a|\/)\s*month\b|\bmonthly\b/i.test(text)) return 'month';
  if (/\b(?:per|a|\/)\s*week\b|\bweekly\b/i.test(text)) return 'week';
  if (/\b(?:per|a|\/)\s*day\b|\bdaily\b/i.test(text)) return 'day';
  return null;
}

function currencyFrom(token) {
  const value = String(token || '').toUpperCase();
  if (value === 'USD') return 'USD';
  if (value === 'EUR' || value === '€') return 'EUR';
  if (value === 'GBP' || value === '£') return 'GBP';
  if (value === 'CAD') return 'CAD';
  return null;
}

function numberFrom(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCompensation(text) {
  const source = String(text || '');
  const match = source.match(/(?<cur>\bUSD\b|\bEUR\b|\bGBP\b|\bCAD\b|\$|€|£)\s*(?<min>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*(?:USD\s*|EUR\s*|GBP\s*|CAD\s*)?(?:\$|€|£)?\s*(?<max>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?))?(?<tail>[^.\n]{0,48})/i);
  if (!match) return unknownCompensation();
  const start = Math.max(0, match.index - 24);
  const window = source.slice(start, match.index + match[0].length);
  const prefixCode = (source.slice(Math.max(0, match.index - 8), match.index).match(/\b(USD|EUR|GBP|CAD)\b/i) || [])[1];
  const tailCode = ((match.groups.tail || '').match(/\b(USD|EUR|GBP|CAD)\b/i) || [])[1];
  const currency = currencyFrom(match.groups.cur) || currencyFrom(prefixCode) || currencyFrom(tailCode);
  return {
    status: 'published',
    min: numberFrom(match.groups.min),
    max: numberFrom(match.groups.max),
    currency,
    payPeriod: payPeriodFrom(window),
    raw: collapse(match[0]),
  };
}

function compensationFromStructured(range) {
  if (!range || typeof range !== 'object') return null;
  const min = Number.isFinite(range.min) ? range.min : (Number.isFinite(range.min_cents) ? range.min_cents / 100 : null);
  const max = Number.isFinite(range.max) ? range.max : (Number.isFinite(range.max_cents) ? range.max_cents / 100 : null);
  if (min == null && max == null) return null;
  const label = `${range.title || ''} ${range.blurb || ''} ${range.interval || ''}`;
  return {
    status: 'published',
    min,
    max,
    currency: currencyFrom(range.currency_type || range.currency) || null,
    payPeriod: payPeriodFrom(label),
    raw: collapse(range.title || range.blurb || `${min ?? ''}–${max ?? ''} ${range.currency_type || range.currency || ''}`.trim()),
  };
}

function headingOf(line) {
  return String(line || '').replace(/[:.]+$/, '').replace(/\s+/g, ' ').trim();
}

function extractSkills(text) {
  const prepared = String(text || '').replace(
    /\s+(?=(?:here(?:'|’)s what you(?:'|’)?ll need|here(?:'|’)s what you need|what you(?:'|’)?ll need|minimum qualifications|basic qualifications|required skills|required qualifications|preferred skills|preferred qualifications|bonus points(?: if you have)?|qualifications|responsibilities|the work)\b)/gi,
    '\n'
  );
  const lines = prepared
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
  let mode = null;
  const required = [];
  const preferred = [];
  const requiredHeading = /^(required|requirements|must have|what you(?:'|’)ll need|here(?:'|’)s what you(?:'|’)?ll need|here(?:'|’)s what you need|qualifications|minimum qualifications|basic qualifications|required skills|required qualifications)\b/i;
  const preferredHeading = /^(preferred|preferred skills|preferred qualifications|nice to have|nice-to-have|bonus|bonus points(?: if you have)?|desired|desired skills)\b/i;
  for (const line of lines) {
    const heading = headingOf(line);
    if (requiredHeading.test(heading)) {
      mode = 'required';
      continue;
    }
    if (preferredHeading.test(heading)) {
      mode = 'preferred';
      continue;
    }
    if (/^(responsibilities|the work|about|about the role|key responsibilities|pay range|the pay range|compensation range|equal employment|equal opportunity|what we offer|what we believe|who we are|eligibility requirements)\b/i.test(heading)) {
      mode = null;
      continue;
    }
    if (!mode || line.length < 8 || line.length > 400) continue;
    if (/^synthetic demo data\b/i.test(line)) continue;
    const bucket = mode === 'required' ? required : preferred;
    if (bucket.length < 15) bucket.push(line);
  }
  if (!required.length && !preferred.length) return unknownSkills();
  return { status: 'published', required, preferred };
}

function extractExperience(title, text) {
  const blob = `${title || ''}\n${text || ''}`;
  const years = blob.match(/\b(\d+\s*(?:\+|plus)?(?:\s*-\s*\d+)?\s*years?(?:\s+of\s+experience)?)\b/i);
  const seniority = String(title || '').match(/\b(intern(?:ship)?|entry[-\s]level|junior|senior|principal|director|lead)\b/i);
  if (!years && !seniority) return unknownExperience();
  return {
    status: 'published',
    yearsText: years ? collapse(years[1]) : null,
    seniority: seniority ? seniority[1].toLowerCase() : null,
  };
}

function extractAuthorization(text) {
  const rules = [
    ['sponsorship_unavailable', /\b(no visa sponsorship|sponsorship is not available|cannot sponsor|not currently sponsoring|will not sponsor)\b/i],
    ['sponsorship_available', /\b(visa sponsorship (?:is )?available|will sponsor|sponsorship available|h-?1b sponsorship)\b/i],
    ['authorization_required', /\b(must be (?:legally )?authorized to work|authorized to work in|u\.s\. citizenship required|us citizenship required|united states citizenship required)\b/i],
  ];
  for (const [stance, pattern] of rules) {
    const match = String(text || '').match(pattern);
    if (match) {
      return { status: 'stated', stance, excerpt: collapse(match[0]) };
    }
  }
  return unknownAuthorization();
}

function extractWorkplace(text, locations) {
  const labels = (locations || []).map((location) => location.label || '').join(' ');
  const blob = `${text || ''}\n${labels}`;
  if (/\bhybrid\b/i.test(blob)) return 'hybrid';
  const remote = /\bremote\b/i.test(blob);
  const onsite = /\bon[-\s]?site\b/i.test(blob);
  if (remote && onsite) return 'unknown';
  if (remote) return 'remote';
  if (onsite) return 'on_site';
  return 'unknown';
}

function extractGeography(text) {
  const source = String(text || '');
  const matches = source.match(/\b(?:remote[^.\n]{0,80}(?:only|must|within|united states|u\.s\.|canada|uk)|must (?:be )?(?:located|reside|live)[^.\n]{0,80}|eligible to work[^.\n]{0,60})/gi) || [];
  const items = [...new Set(matches.map((item) => collapse(item)).filter(Boolean))].slice(0, 5);
  if (!items.length) return { status: 'unknown', restrictions: [] };
  return { status: 'stated', restrictions: items };
}

function extractPublishedDate(text) {
  const match = String(text || '').match(/\b(?:posted|published|date posted)\s*(?:on|:)\s*(\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4})/i);
  if (!match) return null;
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function instructionFlags(text) {
  const flags = [];
  const source = String(text || '');
  for (const pattern of INSTRUCTION_PATTERNS) {
    const match = source.match(pattern);
    if (!match) continue;
    flags.push({
      code: 'untrusted_content',
      message: 'Source text contains instruction-like content and was stored as data only.',
      excerpt: collapse(match[0]).slice(0, 180),
    });
    break;
  }
  return flags;
}

function schemaEmployment(value) {
  const key = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (SCHEMA_EMPLOYMENT[key]) return SCHEMA_EMPLOYMENT[key];
  if (key === 'CONTRACT' || key === 'CONTRACTOR') return 'contract';
  return null;
}

function buildListingRecord(partial) {
  const descriptionText = keepLines(
    partial.descriptionText != null ? partial.descriptionText : htmlToText(partial.descriptionHtml || '')
  ).slice(0, 100000);
  const title = collapse(partial.title).slice(0, 300);
  const locations = (partial.locations || [])
    .map((location) => ({
      label: collapse(location.label || location.name || ''),
      locality: location.locality ? collapse(location.locality) : null,
      region: location.region ? collapse(location.region) : null,
      country: location.country ? collapse(location.country) : null,
    }))
    .filter((location) => location.label);

  const textEmployment = extractEmployment(`${title}\n${descriptionText}`);
  const structuredEmployment = schemaEmployment(partial.employmentType);
  const reviewFlags = [...instructionFlags(`${title}\n${descriptionText}`)];
  let employmentType = 'unknown';
  if (structuredEmployment && textEmployment.employmentType !== 'unknown' && structuredEmployment !== textEmployment.employmentType) {
    employmentType = 'unknown';
    reviewFlags.push({
      code: 'conflicting_employment_type',
      message: 'Structured employment type and posting text disagree.',
      excerpt: textEmployment.excerpt,
    });
  } else if (textEmployment.conflicting) {
    employmentType = 'unknown';
    reviewFlags.push({
      code: 'conflicting_employment_type',
      message: 'Posting text states more than one employment type.',
      excerpt: textEmployment.excerpt,
    });
  } else if (structuredEmployment) {
    employmentType = structuredEmployment;
  } else {
    employmentType = textEmployment.employmentType;
  }

  const compensation = partial.compensation && partial.compensation.status === 'published'
    ? partial.compensation
    : extractCompensation(descriptionText);
  const publishedAt = partial.publishedAt instanceof Date && !Number.isNaN(partial.publishedAt.getTime())
    ? partial.publishedAt
    : extractPublishedDate(descriptionText);
  const oracle = classifyOracleHcm({ title, description: descriptionText });
  if (oracle.platform === 'oracle_cloud_hcm' && oracle.confidence < 0.6) {
    reviewFlags.push({
      code: 'low_confidence',
      message: 'Oracle Cloud HCM wording is present, but the role and module signals are thin.',
      excerpt: oracle.matches[0] ? oracle.matches[0].excerpt : title,
    });
  }

  const workingSchedule = extractHours(descriptionText);
  const skills = extractSkills(descriptionText);
  const engagement = deriveEngagement(`${title}\n${descriptionText}`, employmentType);
  const workingTime = deriveWorkingTime(`${title}\n${descriptionText}`, employmentType, workingSchedule);
  const contentHash = sha256(JSON.stringify({
    title,
    descriptionText,
    employmentType,
    hours: workingSchedule.publishedText,
    locations: locations.map((location) => location.label),
    compensation: compensation.raw,
    workplace: extractWorkplace(descriptionText, locations),
  }));

  return {
    sourceJobId: String(partial.sourceJobId || ''),
    internalJobId: partial.internalJobId ? String(partial.internalJobId) : null,
    requisitionId: partial.requisitionId ? String(partial.requisitionId) : null,
    canonicalUrl: partial.canonicalUrl,
    title,
    descriptionText,
    employmentType,
    engagement,
    workingTime,
    workingSchedule,
    locations,
    workplace: extractWorkplace(descriptionText, locations),
    geography: extractGeography(descriptionText),
    compensation,
    skills,
    oracle,
    experience: extractExperience(title, descriptionText),
    workAuthorization: extractAuthorization(descriptionText),
    publishedAt,
    publishedAtStatus: publishedAt ? 'published' : 'unknown',
    employerName: partial.employerName || '',
    hiringContext: partial.hiringContext || '',
    sourceOwnership: partial.sourceOwnership || '',
    employerType: partial.employerType || '',
    hiringRelationship: partial.hiringRelationship || '',
    classificationEvidence: partial.classificationEvidence || '',
    verificationBasis: partial.verificationBasis || '',
    contentHash,
    reviewFlags,
    extractionConfidence: oracle.confidence,
  };
}

module.exports = {
  extractEmployment,
  deriveEngagement,
  deriveWorkingTime,
  extractHours,
  extractCompensation,
  compensationFromStructured,
  extractSkills,
  extractExperience,
  extractAuthorization,
  extractWorkplace,
  extractGeography,
  extractPublishedDate,
  instructionFlags,
  schemaEmployment,
  buildListingRecord,
  unknownCompensation,
};
