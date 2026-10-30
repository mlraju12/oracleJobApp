const { withinUsaScope } = require('./scope');

const OTHER_PRODUCTS = new Set(['ebs_only', 'peoplesoft_only', 'ebs_and_peoplesoft']);

function relationshipOf(doc) {
  const stored = doc && doc.employmentRelationship;
  if (stored === 'employee' || stored === 'contractor' || stored === 'temporary') return stored;
  const engagement = (doc && doc.engagement) || 'unknown';
  const employmentType = (doc && doc.employmentType) || 'unknown';
  if (employmentType === 'contract' || employmentType === 'contract_to_hire' || engagement === 'contract' || engagement === 'contract_to_hire') {
    return 'contractor';
  }
  if (employmentType === 'temporary' || engagement === 'temporary' || engagement === 'internship') return 'temporary';
  if (engagement === 'permanent') return 'employee';
  return 'unknown';
}

function scheduleOf(doc) {
  const stored = doc && doc.workSchedule;
  if (stored === 'full_time' || stored === 'part_time' || stored === 'variable') return stored;
  if (doc && (doc.workingTime === 'part_time' || doc.employmentType === 'part_time')) return 'part_time';
  if (doc && (doc.workingTime === 'full_time' || doc.employmentType === 'full_time')) return 'full_time';
  return 'unknown';
}

function isSourceListedActive(doc) {
  return doc.listingStatus === 'active' && doc.applicationOpen === 'listed_by_source';
}

function exclusiveBucket(doc) {
  if (doc.listingStatus !== 'active') return 'not_source_listed';
  if (doc.applicationOpen !== 'listed_by_source') return 'not_source_listed';
  const platform = doc.oracle && doc.oracle.platform;
  if (platform === 'oracle_cloud_hcm') return 'oracle_cloud_hcm';
  if (platform === 'mixed') return 'mixed';
  if (OTHER_PRODUCTS.has(platform)) return 'other_oracle_product';
  return 'not_cloud_hcm';
}

function duplicateFlagCount(docs) {
  return docs.filter((doc) => (doc.reviewFlags || []).some((flag) => flag.code === 'possible_duplicate_content' || flag.code === 'distinct_requisition_same_url')).length;
}

function reconcileListings(docs, sources) {
  const live = (docs || []).filter((doc) => !doc.synthetic);
  const counts = {
    oracle_cloud_hcm: 0,
    mixed: 0,
    other_oracle_product: 0,
    not_cloud_hcm: 0,
    not_source_listed: 0,
  };
  const feed = [];
  for (const doc of live) {
    const bucket = exclusiveBucket(doc);
    counts[bucket] += 1;
    if (bucket === 'oracle_cloud_hcm' || bucket === 'mixed') feed.push(doc);
  }
  const sourceListedActive = counts.oracle_cloud_hcm + counts.mixed + counts.other_oracle_product + counts.not_cloud_hcm;
  const defaultFeed = counts.oracle_cloud_hcm + counts.mixed;
  const schedule = { full_time: 0, part_time: 0, variable: 0, unknown: 0 };
  const relationship = { employee: 0, contractor: 0, temporary: 0, unknown: 0 };
  const geography = { usa: 0, other: 0 };
  const employerTypes = { end_user: 0, consulting_firm: 0, staffing_agency: 0, unknown: 0 };
  const endUsers = new Set();
  const consulting = new Set();
  let unknownPostedDate = 0;
  for (const doc of feed) {
    schedule[scheduleOf(doc)] += 1;
    relationship[relationshipOf(doc)] += 1;
    if (withinUsaScope(doc)) geography.usa += 1;
    else geography.other += 1;
    const type = employerTypes[doc.employerType] == null ? 'unknown' : doc.employerType;
    employerTypes[type] += 1;
    if (doc.employerType === 'end_user' && doc.employerName) endUsers.add(doc.employerName);
    if (doc.employerType === 'consulting_firm' && doc.employerName) consulting.add(doc.employerName);
    if (doc.publishedAtStatus !== 'published') unknownPostedDate += 1;
  }
  const boards = (sources || []).filter((source) => !source.synthetic);
  const adapters = [...new Set(boards.map((source) => source.adapterType).filter(Boolean))];
  let lastCollectionAt = null;
  for (const source of boards) {
    const stamp = source.lastSuccessfulCollectionAt || null;
    if (stamp && (!lastCollectionAt || stamp > lastCollectionAt)) lastCollectionAt = stamp;
  }
  return {
    label: 'Listings found across monitored sources',
    activeMeaning: 'Active means the source job list included the requisition. A page that returns HTTP 200 is not treated as verified open.',
    monitoredListings: live.length,
    sourceListedActive,
    defaultFeed,
    oracleCloudHcm: counts.oracle_cloud_hcm,
    mixed: counts.mixed,
    excludedOtherOracleProduct: counts.other_oracle_product,
    excludedNotCloudHcm: counts.not_cloud_hcm,
    excludedNotSourceListed: counts.not_source_listed,
    flaggedSeparateRequisitions: duplicateFlagCount(live),
    equation: `${sourceListedActive} source-listed active = ${counts.oracle_cloud_hcm} Oracle Cloud HCM + ${counts.mixed} mixed + ${counts.other_oracle_product} other Oracle products + ${counts.not_cloud_hcm} not Cloud HCM. ${live.length} monitored listings = ${sourceListedActive} source-listed active + ${counts.not_source_listed} not source-listed.`,
    schedule,
    relationship,
    geography,
    employerTypes,
    endUserEmployers: endUsers.size,
    consultingEmployers: consulting.size,
    unknownPostedDateInFeed: unknownPostedDate,
    boards: boards.length,
    adapters: adapters.length,
    adapterTypes: adapters,
    enabledBoards: boards.filter((source) => source.status === 'enabled').length,
    unsupportedBoards: boards.filter((source) => source.status === 'unsupported').length,
    failingBoards: boards.filter((source) => source.status === 'failing' || source.lastRunStatus === 'failed').length,
    checkedBoards: boards.filter((source) => source.lastRunStatus === 'complete' || source.lastRunStatus === 'partial').length,
    lastCollectionAt,
  };
}

function dateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function withinDate(value, after, before) {
  if (!after && !before) return true;
  const day = dateOnly(value);
  if (!day) return false;
  if (after && day < after) return false;
  if (before && day > before) return false;
  return true;
}

function matchesDerived(item, query) {
  if (query.scope === 'usa' && !withinUsaScope(item)) return false;
  if (query.scope === 'other' && withinUsaScope(item)) return false;
  if (query.relationship && relationshipOf(item) !== query.relationship) return false;
  if (query.schedule && scheduleOf(item) !== query.schedule) return false;
  if (!withinDate(item.publishedAt, query.postedAfter, query.postedBefore)) return false;
  if (!withinDate(item.firstSeenAt, query.discoveredAfter, query.discoveredBefore)) return false;
  return true;
}

function needsDerivedFilter(query) {
  return query.scope === 'usa'
    || query.scope === 'other'
    || !!query.relationship
    || !!query.schedule
    || !!query.postedAfter
    || !!query.postedBefore
    || !!query.discoveredAfter
    || !!query.discoveredBefore;
}

module.exports = {
  relationshipOf,
  scheduleOf,
  exclusiveBucket,
  reconcileListings,
  matchesDerived,
  needsDerivedFilter,
};
