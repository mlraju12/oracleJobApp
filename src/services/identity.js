const { Opportunity } = require('../models');

function materialChanges(previous, next) {
  const changes = [];
  if ((previous.title || '') !== (next.title || '')) changes.push('title');
  if ((previous.descriptionText || '') !== (next.descriptionText || '')) changes.push('description');
  if ((previous.employmentType || '') !== (next.employmentType || '')) changes.push('employment_type');
  if ((previous.engagement || 'unknown') !== (next.engagement || 'unknown')) changes.push('engagement');
  if ((previous.workingTime || 'unknown') !== (next.workingTime || 'unknown')) changes.push('working_time');
  if ((previous.workingSchedule && previous.workingSchedule.publishedText) !== (next.workingSchedule && next.workingSchedule.publishedText)) {
    changes.push('hours');
  }
  if ((previous.compensation && previous.compensation.raw) !== (next.compensation && next.compensation.raw)) changes.push('compensation');
  const prevLocations = (previous.locations || []).map((location) => location.label).join('|');
  const nextLocations = (next.locations || []).map((location) => location.label).join('|');
  if (prevLocations !== nextLocations) changes.push('locations');
  return changes;
}

async function findIdentity({ tenantId, employerKey, incoming }) {
  const byJobId = await Opportunity.findOne({
    tenantId,
    employerKey,
    sourceJobId: incoming.sourceJobId,
  });
  if (byJobId) return { target: byJobId, flags: [], reason: 'employer_and_source_job_id' };

  const flags = [];
  if (incoming.canonicalUrl) {
    const byUrl = await Opportunity.findOne({ tenantId, employerKey, canonicalUrl: incoming.canonicalUrl });
    if (byUrl && byUrl.sourceJobId && byUrl.sourceJobId !== incoming.sourceJobId) {
      flags.push({
        code: 'distinct_requisition_same_url',
        message: 'Same employer and canonical URL, with a different source job ID. Listings were kept separate.',
        excerpt: incoming.canonicalUrl,
      });
    } else if (byUrl && (!byUrl.sourceJobId || byUrl.sourceJobId === incoming.sourceJobId)) {
      return { target: byUrl, flags, reason: 'canonical_url' };
    }
  }
  if (incoming.contentHash) {
    const byHash = await Opportunity.findOne({
      tenantId,
      employerKey,
      contentHash: incoming.contentHash,
      sourceJobId: { $ne: incoming.sourceJobId },
    });
    if (byHash) {
      flags.push({
        code: 'possible_duplicate_content',
        message: 'Another requisition from this employer has the same content hash. Titles alone are not merged, and neither is this hash.',
        excerpt: byHash.title,
      });
    }
  }
  return { target: null, flags, reason: 'new' };
}

module.exports = {
  materialChanges,
  findIdentity,
};
