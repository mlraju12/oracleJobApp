const { Opportunity, CollectionRun } = require('../models');
const { buildListingRecord } = require('./extract');
const { findIdentity, materialChanges } = require('./identity');
const { collectSource } = require('./adapters');
const { classFromSource, verificationFrom } = require('./employerClass');
const { sha256 } = require('./text');

const SYNTHETIC_LABEL = 'Synthetic demo data. Not a live employer listing.';

function assignListing(doc, source, incoming, now) {
  doc.employerName = incoming.employerName || source.name;
  doc.employerDomain = source.domain;
  doc.sourceOwnership = incoming.sourceOwnership || source.ownership || 'unknown';
  doc.hiringContext = incoming.hiringContext || source.hiringContext || 'unknown';
  if (!doc.classificationCorrected) {
    const employerClass = incoming.employerType
      ? {
        employerType: incoming.employerType,
        hiringRelationship: incoming.hiringRelationship || 'unknown',
        classificationEvidence: incoming.classificationEvidence || '',
      }
      : classFromSource(source);
    doc.employerType = employerClass.employerType;
    doc.hiringRelationship = employerClass.hiringRelationship;
    doc.classificationEvidence = employerClass.classificationEvidence;
  }
  const verification = verificationFrom(incoming.verificationBasis);
  if (verification.applicationOpen === 'listed_by_source' || !doc.applicationOpen || doc.applicationOpen === 'not_established') {
    doc.listingStatus = verification.listingStatus;
    doc.presenceConfidence = verification.presenceConfidence;
    doc.applicationOpen = verification.applicationOpen;
    doc.listingStatusEvidence = { ...verification.listingStatusEvidence, checkedAt: now };
  }
  doc.sourceId = source._id;
  doc.internalJobId = incoming.internalJobId;
  doc.requisitionId = incoming.requisitionId;
  doc.canonicalUrl = incoming.canonicalUrl;
  doc.title = incoming.title;
  doc.descriptionText = incoming.descriptionText;
  doc.employmentType = incoming.employmentType;
  doc.engagement = incoming.engagement || 'unknown';
  doc.workingTime = incoming.workingTime || 'unknown';
  doc.employmentRelationship = incoming.employmentRelationship || 'unknown';
  doc.workSchedule = incoming.workSchedule || 'unknown';
  doc.contractDuration = incoming.contractDuration || { status: 'unknown', text: null };
  doc.workingSchedule = incoming.workingSchedule;
  doc.locations = incoming.locations;
  doc.workplace = incoming.workplace;
  doc.geography = incoming.geography;
  doc.compensation = incoming.compensation;
  doc.skills = incoming.skills;
  doc.oracle = incoming.oracle;
  doc.experience = incoming.experience;
  doc.workAuthorization = incoming.workAuthorization;
  if (incoming.publishedAt) {
    doc.publishedAt = incoming.publishedAt;
    doc.publishedAtStatus = 'published';
  } else if (!doc.publishedAt) {
    doc.publishedAt = null;
    doc.publishedAtStatus = 'unknown';
  }
  doc.contentHash = incoming.contentHash;
  doc.extractionConfidence = incoming.extractionConfidence;
  doc.lastSeenAt = now;
  doc.lastCheckedAt = now;
  doc.synthetic = !!source.synthetic;
  doc.syntheticLabel = source.synthetic ? (source.syntheticLabel || SYNTHETIC_LABEL) : '';
}

async function applyListing(source, partial, context) {
  const incoming = buildListingRecord(partial);
  if (!incoming.sourceJobId) return { skipped: true };
  const identity = await findIdentity({
    tenantId: source.tenantId,
    employerKey: source.employerKey,
    incoming,
  });
  const now = context.now;
  let doc = identity.target;
  const created = !doc;
  if (!doc) {
    doc = new Opportunity({
      tenantId: source.tenantId,
      employerKey: source.employerKey,
      sourceJobId: incoming.sourceJobId,
      firstSeenAt: now,
      repostCount: 0,
      changeLog: [],
      sourceRefs: [],
    });
  }
  const changes = created ? [] : materialChanges(doc.toObject(), { ...incoming, locations: incoming.locations });
  const reopened = !created && (doc.listingStatus === 'removed' || doc.listingStatus === 'expired');
  assignListing(doc, source, incoming, now);
  if (reopened) {
    doc.repostCount += 1;
    doc.reviewFlags = [...incoming.reviewFlags, ...identity.flags, {
      code: 'repost',
      message: 'This source job ID returned after it had been removed or expired.',
      excerpt: incoming.title,
    }];
  } else {
    doc.reviewFlags = [...incoming.reviewFlags, ...identity.flags];
  }
  if (changes.length) {
    doc.changeLog = [...(doc.changeLog || []), {
      at: now,
      contentHash: incoming.contentHash,
      summary: changes.join(', '),
    }].slice(-20);
  }
  const refs = [...(doc.sourceRefs || [])];
  const sourceId = String(source._id);
  if (!refs.some((ref) => String(ref.sourceId) === sourceId && ref.sourceJobId === incoming.sourceJobId)) {
    refs.push({
      sourceId: source._id,
      sourceJobId: incoming.sourceJobId,
      canonicalUrl: incoming.canonicalUrl,
      collectedAt: now,
    });
  }
  doc.sourceRefs = refs.slice(-10);
  doc.lastCollectionRunId = context.runId || null;
  const jobKey = sha256(String(incoming.sourceJobId || incoming.canonicalUrl || incoming.title)).slice(0, 32);
  const storageKey = `tenants/${source.tenantId}/sources/${source._id}/${jobKey}/${incoming.contentHash}.json`;
  if (context.storage) {
    await context.storage.put(storageKey, JSON.stringify({
      synthetic: !!source.synthetic,
      sourceJobId: incoming.sourceJobId,
      canonicalUrl: incoming.canonicalUrl,
      contentHash: incoming.contentHash,
      title: incoming.title,
      descriptionText: incoming.descriptionText,
      collectedAt: now.toISOString(),
    }));
    doc.evidence = { storageKey, contentHash: incoming.contentHash };
  }
  await doc.save();
  if (context.afterEach) await context.afterEach(doc);
  return { created, updated: !created, changes, id: doc._id };
}

async function refreshSource(source, deps = {}) {
  const now = deps.now ? deps.now() : new Date();
  const run = await CollectionRun.create({
    tenantId: source.tenantId,
    sourceId: source._id,
    status: 'running',
    startedAt: now,
    created: 0,
    updated: 0,
    removed: 0,
    fetched: 0,
    stages: [{ stage: 'collect', at: now, note: 'Source job list requested. Discovery is a separate employer-registry stage.' }],
  });
  source.lastRunStatus = 'running';
  source.lastRunAt = now;
  await source.save();
  const context = {
    now,
    runId: run._id,
    storage: deps.storage,
    afterEach: deps.afterEach,
  };
  try {
    const result = await collectSource(source, deps);
    let created = 0;
    let updated = 0;
    const seen = new Set();
    for (const listing of result.listings || []) {
      if (seen.has(String(listing.sourceJobId))) continue;
      seen.add(String(listing.sourceJobId));
      const applied = await applyListing(source, listing, context);
      if (applied.skipped) continue;
      if (applied.created) created += 1;
      else updated += 1;
    }
    let removed = 0;
    if (result.applyAbsencePolicy && result.complete && source.closurePolicy !== 'never_auto_close') {
      const stale = await Opportunity.find({
        tenantId: source.tenantId,
        sourceId: source._id,
        listingStatus: 'active',
        sourceJobId: { $nin: [...seen] },
      });
      for (const opportunity of stale) {
        opportunity.listingStatus = 'removed';
        opportunity.presenceConfidence = 'confirmed';
        opportunity.applicationOpen = 'absent_after_complete_scan';
        opportunity.lastCheckedAt = now;
        opportunity.listingStatusEvidence = {
          policy: 'absent_after_complete_refresh',
          runId: String(run._id),
          note: 'The listing was absent from a complete source snapshot. A failed or partial refresh does not use this policy.',
        };
        await opportunity.save();
        removed += 1;
      }
    } else {
      await Opportunity.updateMany(
        {
          tenantId: source.tenantId,
          sourceId: source._id,
          listingStatus: 'active',
          sourceJobId: { $nin: [...seen] },
        },
        { $set: { presenceConfidence: 'unverified' } }
      );
    }
    run.status = result.complete ? 'complete' : 'partial';
    run.error = result.error || '';
    run.finishedAt = new Date();
    run.pages = result.pages || 0;
    run.fetched = seen.size;
    run.created = created;
    run.updated = updated;
    run.removed = removed;
    run.requests = result.requests || 0;
    run.completeness = result.completeness || null;
    run.warnings = result.warnings || [];
    run.stages = [
      ...(run.stages || []),
      { stage: 'classify', at: new Date(), note: 'Kept listings were classified from the title and the full description. Ambiguous Oracle mentions are flagged for review.' },
    ];
    await run.save();
    source.lastRunStatus = run.status;
    if (result.complete) {
      source.lastSuccessfulCollectionAt = now;
      source.failureCount = 0;
      if (source.status === 'failing') source.status = 'enabled';
      source.nextAttemptAt = new Date(now.getTime() + (source.refreshIntervalMinutes || 360) * 60000);
    } else if (!result.error && ['public-search', 'dice-mcp', 'ashby-job-board', 'smartrecruiters-postings', 'public-structured', 'public-job-feed', 'external-search', 'oracle-candidate-experience'].includes(source.adapterType)) {
      if (source.status === 'failing') source.status = 'enabled';
      source.nextAttemptAt = new Date(now.getTime() + (source.refreshIntervalMinutes || 360) * 60000);
    } else {
      source.failureCount = (source.failureCount || 0) + 1;
      if (source.status === 'enabled') source.status = 'failing';
    }
    await source.save();
    return run;
  } catch (error) {
    run.status = 'failed';
    run.error = error.message;
    run.finishedAt = new Date();
    await run.save();
    source.lastRunStatus = 'failed';
    source.failureCount = (source.failureCount || 0) + 1;
    if (source.status === 'enabled') source.status = 'failing';
    const minutes = Math.min(24 * 60, 15 * (2 ** Math.min(source.failureCount, 6)));
    source.nextAttemptAt = new Date(Date.now() + minutes * 60000);
    await source.save();
    await Opportunity.updateMany(
      {
        tenantId: source.tenantId,
        sourceId: source._id,
        listingStatus: 'active',
        lastCheckedAt: { $lt: run.startedAt },
      },
      { $set: { presenceConfidence: 'unverified' } }
    );
    return run;
  }
}

function isDue(source, now) {
  if (!source) return false;
  if (!['enabled', 'failing'].includes(source.status)) return false;
  if (!['greenhouse-job-board', 'lever-postings', 'public-search', 'dice-mcp', 'ashby-job-board', 'smartrecruiters-postings', 'public-structured', 'public-job-feed', 'oracle-candidate-experience'].includes(source.adapterType)) return false;
  if (source.nextAttemptAt && new Date(source.nextAttemptAt) > now) return false;
  return true;
}

module.exports = {
  SYNTHETIC_LABEL,
  applyListing,
  refreshSource,
  isDue,
};
