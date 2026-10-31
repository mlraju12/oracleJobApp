const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  label: String,
  locality: String,
  region: String,
  country: String,
}, { _id: false });

const flagSchema = new mongoose.Schema({
  code: String,
  message: String,
  excerpt: String,
}, { _id: false });

const opportunitySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  synthetic: { type: Boolean, default: false },
  syntheticLabel: { type: String, default: '' },
  employerName: String,
  employerKey: { type: String, required: true },
  employerDomain: String,
  sourceOwnership: { type: String, enum: ['direct_employer', 'staffing_company', 'unknown'], default: 'unknown' },
  hiringContext: { type: String, enum: ['direct_client', 'consulting_firm', 'unknown'], default: 'unknown' },
  employerType: { type: String, enum: ['end_user', 'consulting_firm', 'staffing_agency', 'unknown'], default: 'unknown' },
  hiringRelationship: { type: String, enum: ['own_team', 'named_client', 'undisclosed_client', 'unknown'], default: 'unknown' },
  classificationEvidence: { type: String, default: '' },
  classificationCorrected: { type: Boolean, default: false },
  applicationOpen: { type: String, enum: ['listed_by_source', 'not_established', 'absent_after_complete_scan'], default: 'not_established' },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  sourceJobId: { type: String, required: true },
  internalJobId: String,
  requisitionId: String,
  canonicalUrl: String,
  title: String,
  descriptionText: String,
  employmentType: {
    type: String,
    enum: ['full_time', 'part_time', 'contract', 'contract_to_hire', 'temporary', 'project_based', 'unknown'],
    default: 'unknown',
  },
  engagement: {
    type: String,
    enum: ['permanent', 'contract', 'temporary', 'internship', 'contract_to_hire', 'unknown'],
    default: 'unknown',
  },
  workingTime: {
    type: String,
    enum: ['full_time', 'part_time', 'stated_hours', 'unknown'],
    default: 'unknown',
  },
  employmentRelationship: {
    type: String,
    enum: ['employee', 'contractor', 'temporary', 'unknown'],
    default: 'unknown',
  },
  workSchedule: {
    type: String,
    enum: ['full_time', 'part_time', 'variable', 'unknown'],
    default: 'unknown',
  },
  contractDuration: {
    status: { type: String, enum: ['stated', 'unknown'], default: 'unknown' },
    text: String,
  },
  workingSchedule: {
    status: { type: String, enum: ['published', 'unknown'], default: 'unknown' },
    publishedText: String,
    hoursPerWeek: Number,
  },
  locations: [locationSchema],
  workplace: { type: String, enum: ['remote', 'hybrid', 'on_site', 'unknown'], default: 'unknown' },
  geography: {
    status: { type: String, enum: ['stated', 'unknown'], default: 'unknown' },
    restrictions: [String],
  },
  compensation: {
    status: { type: String, enum: ['published', 'unknown'], default: 'unknown' },
    min: Number,
    max: Number,
    currency: String,
    payPeriod: { type: String, default: undefined },
    raw: String,
  },
  skills: {
    status: { type: String, enum: ['published', 'unknown'], default: 'unknown' },
    required: [String],
    preferred: [String],
  },
  oracle: {
    platform: String,
    roleCategory: String,
    modules: [String],
    matches: [{ field: String, label: String, excerpt: String }],
    confidence: Number,
    relevance: {
      score: Number,
      mention: String,
      basis: String,
    },
  },
  experience: {
    status: { type: String, enum: ['published', 'unknown'], default: 'unknown' },
    yearsText: String,
    yearsMin: Number,
    yearsMax: Number,
    seniority: String,
  },
  workAuthorization: {
    status: { type: String, enum: ['stated', 'unknown'], default: 'unknown' },
    stance: String,
    excerpt: String,
  },
  publishedAt: Date,
  publishedAtStatus: { type: String, enum: ['published', 'unknown'], default: 'unknown' },
  firstSeenAt: Date,
  lastSeenAt: Date,
  lastCheckedAt: Date,
  listingStatus: { type: String, enum: ['active', 'expired', 'removed', 'unknown'], default: 'active' },
  listingStatusEvidence: mongoose.Schema.Types.Mixed,
  presenceConfidence: { type: String, enum: ['confirmed', 'unverified'], default: 'confirmed' },
  contentHash: String,
  evidence: { storageKey: String, contentHash: String },
  sourceRefs: [{
    sourceId: mongoose.Schema.Types.ObjectId,
    sourceJobId: String,
    canonicalUrl: String,
    collectedAt: Date,
  }],
  repostCount: { type: Number, default: 0 },
  changeLog: [{ at: Date, contentHash: String, summary: String }],
  reviewFlags: [flagSchema],
  extractionConfidence: Number,
  lastCollectionRunId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });

opportunitySchema.index({ tenantId: 1, employerKey: 1, sourceJobId: 1 }, { unique: true });
opportunitySchema.index({ tenantId: 1, canonicalUrl: 1 });
opportunitySchema.index({ tenantId: 1, contentHash: 1 });

const sourceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true },
  domain: { type: String, required: true },
  employerKey: { type: String, required: true },
  careerSiteUrl: String,
  atsProvider: { type: String, default: 'unknown' },
  adapterType: { type: String, required: true },
  ownership: { type: String, enum: ['direct_employer', 'staffing_company', 'unknown'], default: 'unknown' },
  hiringContext: { type: String, enum: ['direct_client', 'consulting_firm', 'unknown'], default: 'unknown' },
  employerType: { type: String, enum: ['end_user', 'consulting_firm', 'staffing_agency', 'unknown'], default: 'unknown' },
  hiringRelationship: { type: String, enum: ['own_team', 'named_client', 'undisclosed_client', 'unknown'], default: 'unknown' },
  classificationEvidence: { type: String, default: '' },
  accessMethod: { type: String, enum: ['public_api', 'public_page', 'manual'], default: 'manual' },
  accessDocumentationUrl: String,
  accessNotes: String,
  termsReviewStatus: {
    type: String,
    enum: ['not_reviewed', 'public_read_documented', 'blocked', 'rejected'],
    default: 'not_reviewed',
  },
  termsNotes: String,
  refreshIntervalMinutes: { type: Number, default: 360 },
  lastSuccessfulCollectionAt: Date,
  lastRunStatus: { type: String, default: 'never' },
  lastRunAt: Date,
  nextAttemptAt: Date,
  failureCount: { type: Number, default: 0 },
  closurePolicy: {
    type: String,
    enum: ['absent_after_complete_refresh', 'never_auto_close'],
    default: 'absent_after_complete_refresh',
  },
  status: { type: String, enum: ['enabled', 'paused', 'unsupported', 'failing'], default: 'paused' },
  adapterConfig: mongoose.Schema.Types.Mixed,
  synthetic: { type: Boolean, default: false },
  syntheticLabel: String,
  catalogKey: String,
}, { timestamps: true });
sourceSchema.index(
  { tenantId: 1, catalogKey: 1 },
  { unique: true, partialFilterExpression: { catalogKey: { $type: 'string' } } }
);

const runSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  status: { type: String, enum: ['running', 'complete', 'partial', 'failed'], default: 'running' },
  startedAt: Date,
  finishedAt: Date,
  error: String,
  pages: Number,
  fetched: Number,
  created: Number,
  updated: Number,
  removed: Number,
  requests: Number,
  completeness: mongoose.Schema.Types.Mixed,
  warnings: [String],
  stages: [{
    stage: String,
    at: Date,
    note: String,
  }],
}, { timestamps: true });

const leadSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  key: { type: String, required: true },
  name: { type: String, required: true },
  domain: { type: String, default: '' },
  careersUrl: { type: String, default: '' },
  resolvedBoardUrl: { type: String, default: '' },
  platform: { type: String, default: '' },
  boardIdentifier: { type: String, default: '' },
  geography: { type: String, default: '' },
  employerType: { type: String, enum: ['end_user', 'consulting_firm', 'staffing_agency', 'unknown'], default: 'unknown' },
  hiringRelationship: { type: String, enum: ['own_team', 'named_client', 'undisclosed_client', 'unknown'], default: 'unknown' },
  evidenceUrl: { type: String, default: '' },
  connectorStatus: {
    type: String,
    enum: ['candidate', 'verified', 'supported', 'unsupported', 'unresolved'],
    default: 'candidate',
  },
  connectorReason: { type: String, default: '' },
  cohort: { type: String, default: 'end_user_candidate' },
  catalogKey: { type: String, default: '' },
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  lastSuccessfulCrawlAt: Date,
  stage: { type: String, default: 'discovered' },
}, { timestamps: true });
leadSchema.index({ tenantId: 1, key: 1 }, { unique: true });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'tenant_admin' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  mfaEnabled: { type: Boolean, default: false },
  mfaSecret: String,
  mfaBackupCodes: [String],
  lastFeedSeenAt: Date,
  searchScope: { type: String, enum: ['usa', 'any'], default: 'usa' },
  resume: {
    fileName: String,
    contentType: String,
    bytes: Number,
    storageKey: String,
    uploadedAt: Date,
  },
}, { timestamps: true });

const savedSearchSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true },
  filters: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const savedOpportunitySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  opportunityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  personalStatus: {
    type: String,
    enum: ['saved', 'interested', 'contacting_offline', 'interviewing', 'not_pursuing'],
    default: 'saved',
  },
  notes: String,
}, { timestamps: true });

savedOpportunitySchema.index({ tenantId: 1, userId: 1, opportunityId: 1 }, { unique: true });

const applicationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  opportunityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['opened_employer_site', 'submitted_by_me'], default: 'opened_employer_site' },
  employerUrl: String,
  resumeFileName: String,
  openedAt: Date,
  submittedAt: Date,
}, { timestamps: true });

applicationSchema.index({ tenantId: 1, userId: 1, opportunityId: 1 }, { unique: true });

const applyQueueSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  opportunityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  position: { type: Number, required: true },
  state: { type: String, enum: ['queued', 'opened', 'submitted', 'skipped'], default: 'queued' },
}, { timestamps: true });

applyQueueSchema.index({ tenantId: 1, userId: 1, opportunityId: 1 }, { unique: true });

const emailOutreachSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  opportunityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  email: { type: String, required: true },
  resumeFileName: String,
  sentAt: Date,
}, { timestamps: true });

emailOutreachSchema.index({ tenantId: 1, userId: 1, opportunityId: 1, email: 1 }, { unique: true });

module.exports = {
  Opportunity: mongoose.models.Opportunity || mongoose.model('Opportunity', opportunitySchema),
  EmployerSource: mongoose.models.EmployerSource || mongoose.model('EmployerSource', sourceSchema),
  CollectionRun: mongoose.models.CollectionRun || mongoose.model('CollectionRun', runSchema),
  User: mongoose.models.User || mongoose.model('User', userSchema),
  SavedSearch: mongoose.models.SavedSearch || mongoose.model('SavedSearch', savedSearchSchema),
  SavedOpportunity: mongoose.models.SavedOpportunity || mongoose.model('SavedOpportunity', savedOpportunitySchema),
  Application: mongoose.models.Application || mongoose.model('Application', applicationSchema),
  ApplyQueueItem: mongoose.models.ApplyQueueItem || mongoose.model('ApplyQueueItem', applyQueueSchema),
  EmailOutreach: mongoose.models.EmailOutreach || mongoose.model('EmailOutreach', emailOutreachSchema),
  EmployerLead: mongoose.models.EmployerLead || mongoose.model('EmployerLead', leadSchema),
};
