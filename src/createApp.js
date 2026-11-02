const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const {
  User,
  EmployerSource,
  Opportunity,
  CollectionRun,
  SavedSearch,
  SavedOpportunity,
  Application,
  ApplyQueueItem,
  EmailOutreach,
  MemberCredential,
} = require('./models');
const { employerKey, escapeRegex } = require('./services/text');
const { assertSafeOutboundUrl } = require('./services/outbound');
const { ADAPTERS, adapterById, importPublicUrl } = require('./services/adapters');
const { applyListing, refreshSource } = require('./services/collect');
const { reconcileListings, matchesDerived, needsDerivedFilter, relationshipOf, scheduleOf } = require('./services/reconcile');
const { EMPLOYER_TYPES, HIRING_RELATIONSHIPS } = require('./services/employerClass');
const { startCatalogRefresh, catalogRefreshRunning } = require('./services/catalog');
const { discoveryReport, importEmployer, searchProviderStatus } = require('./services/discovery');
const { publishedEmails, emailDraft } = require('./services/outreach');
const { memberSite, attemptMemberLogin } = require('./services/memberLogin');
const { createStorage, encryptSecret, decryptSecret } = require('./services/platform');
const { createBullQueue, redisUrl } = require('./services/queue');

authenticator.options = { window: 1 };

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'x-xsrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tokensMatch(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function publicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    role: user.role,
    tenantId: String(user.tenantId),
    mfaEnabled: !!user.mfaEnabled,
  };
}

function presentResume(resume) {
  if (!resume || !resume.fileName) return null;
  return {
    fileName: resume.fileName,
    contentType: resume.contentType,
    bytes: resume.bytes,
    uploadedAt: resume.uploadedAt || null,
  };
}

function presentApplication(application) {
  return {
    id: String(application._id),
    opportunityId: String(application.opportunityId),
    status: application.status,
    employerUrl: application.employerUrl || null,
    resumeFileName: application.resumeFileName || '',
    openedAt: application.openedAt || null,
    submittedAt: application.submittedAt || null,
  };
}

function resumeFileName(header, contentType) {
  const extensions = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  };
  const extension = extensions[contentType];
  if (!extension) return '';
  let name = 'resume';
  try {
    name = decodeURIComponent(String(header || 'resume'));
  } catch {
    name = 'resume';
  }
  name = path.basename(name).replace(/[^A-Za-z0-9._ -]/g, '').slice(0, 80) || 'resume';
  if (!name.toLowerCase().endsWith(extension)) name = `${name.replace(/\.[^.]+$/, '')}${extension}`;
  return name;
}

function presentSource(source, credential) {
  const adapter = adapterById(source.adapterType);
  return {
    id: String(source._id),
    name: source.name,
    domain: source.domain,
    careerSiteUrl: source.careerSiteUrl || null,
    atsProvider: source.atsProvider,
    adapterType: source.adapterType,
    adapterVerified: !!(adapter && adapter.verified),
    adapterSummary: adapter ? adapter.summary : 'Unsupported adapter.',
    ownership: source.ownership,
    hiringContext: source.hiringContext || 'unknown',
    employerType: source.employerType || 'unknown',
    hiringRelationship: source.hiringRelationship || 'unknown',
    classificationEvidence: source.classificationEvidence || '',
    accessMethod: source.accessMethod,
    accessDocumentationUrl: source.accessDocumentationUrl || (adapter && adapter.documentationUrl) || null,
    accessNotes: source.accessNotes || '',
    termsReviewStatus: source.termsReviewStatus,
    termsNotes: source.termsNotes || '',
    refreshIntervalMinutes: source.refreshIntervalMinutes,
    lastSuccessfulCollectionAt: source.lastSuccessfulCollectionAt || null,
    lastRunStatus: source.lastRunStatus,
    lastRunAt: source.lastRunAt || null,
    nextAttemptAt: source.nextAttemptAt || null,
    closurePolicy: source.closurePolicy || 'absent_after_complete_refresh',
    status: source.status,
    adapterConfig: {
      boardToken: source.adapterConfig && source.adapterConfig.boardToken || '',
      site: source.adapterConfig && source.adapterConfig.site || '',
      region: source.adapterConfig && source.adapterConfig.region || 'global',
      fetchDetails: !!(source.adapterConfig && source.adapterConfig.fetchDetails),
    },
    synthetic: !!source.synthetic,
    syntheticLabel: source.syntheticLabel || '',
    catalogKey: source.catalogKey || null,
    asksForLogin: !!memberSite(source.catalogKey),
    savedUsername: credential && credential.username || null,
    loginStatus: credential && credential.lastLoginStatus || 'never',
    loginMessage: credential && credential.lastLoginMessage || '',
  };
}

function presentOpportunity(opportunity, saved, extras = {}) {
  return {
    id: String(opportunity._id),
    synthetic: !!opportunity.synthetic,
    syntheticLabel: opportunity.syntheticLabel || '',
    employerName: opportunity.employerName,
    employerDomain: opportunity.employerDomain,
    sourceOwnership: opportunity.sourceOwnership,
    hiringContext: opportunity.hiringContext || 'unknown',
    employerType: opportunity.employerType || 'unknown',
    hiringRelationship: opportunity.hiringRelationship || 'unknown',
    classificationEvidence: opportunity.classificationEvidence || '',
    classificationCorrected: !!opportunity.classificationCorrected,
    applicationOpen: opportunity.applicationOpen || 'not_established',
    sourceId: String(opportunity.sourceId),
    sourceJobId: opportunity.sourceJobId,
    internalJobId: opportunity.internalJobId || null,
    requisitionId: opportunity.requisitionId || null,
    canonicalUrl: opportunity.canonicalUrl || null,
    title: opportunity.title,
    descriptionText: opportunity.descriptionText || '',
    employmentType: opportunity.employmentType,
    engagement: opportunity.engagement || 'unknown',
    workingTime: opportunity.workingTime || 'unknown',
    employmentRelationship: relationshipOf(opportunity),
    workSchedule: scheduleOf(opportunity),
    contractDuration: opportunity.contractDuration || { status: 'unknown', text: null },
    lastVerifiedAt: opportunity.lastCheckedAt || null,
    sourceName: extras.sourceName || '',
    adapterType: extras.adapterType || '',
    isNew: !!extras.isNew,
    workingSchedule: opportunity.workingSchedule,
    locations: opportunity.locations || [],
    workplace: opportunity.workplace,
    geography: opportunity.geography,
    compensation: opportunity.compensation,
    skills: opportunity.skills,
    oracle: opportunity.oracle,
    experience: opportunity.experience,
    workAuthorization: opportunity.workAuthorization,
    publishedAt: opportunity.publishedAt || null,
    publishedAtStatus: opportunity.publishedAtStatus,
    firstSeenAt: opportunity.firstSeenAt,
    lastSeenAt: opportunity.lastSeenAt,
    lastCheckedAt: opportunity.lastCheckedAt,
    listingStatus: opportunity.listingStatus,
    listingStatusEvidence: opportunity.listingStatusEvidence || null,
    presenceConfidence: opportunity.presenceConfidence,
    contentHash: opportunity.contentHash,
    evidence: opportunity.evidence || null,
    sourceRefs: (opportunity.sourceRefs || []).map((ref) => ({
      sourceId: String(ref.sourceId),
      sourceJobId: ref.sourceJobId,
      canonicalUrl: ref.canonicalUrl || null,
      collectedAt: ref.collectedAt,
    })),
    repostCount: opportunity.repostCount || 0,
    changeLog: opportunity.changeLog || [],
    reviewFlags: opportunity.reviewFlags || [],
    extractionConfidence: opportunity.extractionConfidence,
    personalStatus: saved ? saved.personalStatus : null,
    personalNotes: saved ? saved.notes || '' : '',
    publishedEmails: publishedEmails(opportunity.descriptionText),
  };
}

function cleanConfig(input) {
  const config = input && typeof input === 'object' ? input : {};
  return {
    boardToken: String(config.boardToken || '').trim(),
    site: String(config.site || '').trim(),
    boardName: String(config.boardName || '').trim(),
    companyIdentifier: String(config.companyIdentifier || '').trim(),
    pageUrl: String(config.pageUrl || '').trim(),
    oracleOnly: !!config.oracleOnly,
    region: config.region === 'eu' ? 'eu' : 'global',
    fetchDetails: !!config.fetchDetails,
    minIntervalMs: Math.min(Math.max(Number(config.minIntervalMs) || 1000, 0), 60000),
  };
}

function resolvedStatus(payload) {
  const adapterType = payload.adapterType;
  let status = payload.status || 'paused';
  if (!adapterById(adapterType) || adapterType === 'unsupported') return 'unsupported';
  if (status === 'enabled') {
    if (['blocked', 'rejected'].includes(payload.termsReviewStatus)) {
      const error = new Error('Terms review blocks collection for this source.');
      error.status = 400;
      throw error;
    }
    if (['greenhouse-job-board', 'lever-postings', 'ashby-job-board', 'smartrecruiters-postings', 'public-structured', 'public-job-feed'].includes(adapterType) && payload.termsReviewStatus !== 'public_read_documented') {
      const error = new Error('Record a public-read terms review before enabling this adapter.');
      error.status = 400;
      throw error;
    }
  }
  if (!['enabled', 'paused', 'unsupported', 'failing'].includes(status)) return 'paused';
  return status;
}

function requireUser(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.tenantId) {
    return res.status(401).json({ error: 'Sign in required.' });
  }
  req.auth = {
    userId: String(req.session.user.id),
    tenantId: String(req.session.user.tenantId),
    role: req.session.user.role || 'tenant_admin',
    username: req.session.user.username,
  };
  return next();
}

function requireWriter(req, res, next) {
  if (req.auth.role === 'viewer') return res.status(403).json({ error: 'This account is read only.' });
  return next();
}

async function createApp(options = {}) {
  const mongoUri = options.mongoUri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongoUri);
  await Opportunity.deleteMany({ synthetic: true });
  await EmployerSource.deleteMany({ synthetic: true });

  const app = express();
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  const storage = options.storage || createStorage({ driver: options.storageDriver, env: process.env });
  const autoCollect = options.autoCollect !== false && process.env.NODE_ENV !== 'test';
  function kickCatalog(tenantId, force) {
    if (!autoCollect) return Promise.resolve(false);
    return startCatalogRefresh(tenantId, fetchDeps(options, storage), { force: !!force });
  }
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'test' ? 'test-session-secret-value' : '');
  if (!secret) throw new Error('SESSION_SECRET is required.');

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  const origins = String(process.env.CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
  app.use(cors({ origin: origins.length ? origins : false, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(session({
    name: 'ohcm.sid',
    secret,
    resave: false,
    saveUninitialized: false,
    store: process.env.NODE_ENV === 'test'
      ? new session.MemoryStore()
      : MongoStore.create({ client: mongoose.connection.getClient() }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));
  app.use((req, res, next) => {
    if (!req.cookies[CSRF_COOKIE]) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      req.cookies[CSRF_COOKIE] = token;
    }
    next();
  });
  app.use((req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (tokensMatch(req.cookies[CSRF_COOKIE], req.get(CSRF_HEADER))) return next();
    return res.status(403).json({ error: 'Invalid or missing security token. Refresh the page and try again.' });
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 10000 : Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Wait a few minutes and try again.' },
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'oracle-hcm-opportunities' });
  });

  app.get('/api/adapters', requireUser, (req, res) => {
    res.json({
      adapters: ADAPTERS,
      absencePolicy: 'A listing is marked removed only when it is missing after a complete source snapshot. A failed or partial refresh leaves existing listings active and marks presence unverified.',
    });
  });

  app.post('/api/auth/register', authLimiter, async (req, res, next) => {
    try {
      const username = String(req.body.username || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      if (!/^[a-z0-9._@-]{3,80}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3–80 characters: letters, numbers, . _ @ -' });
      }
      if (password.length < 10) return res.status(400).json({ error: 'Use a password of at least 10 characters.' });
      const existing = await User.findOne({ username });
      if (existing) return res.status(409).json({ error: 'That username is already registered.' });
      const user = new User({
        username,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'tenant_admin',
        tenantId: new mongoose.Types.ObjectId(),
      });
      user.tenantId = user._id;
      await user.save();
      await startSession(req, user);
      await kickCatalog(user.tenantId, true);
      res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res, next) => {
    try {
      const username = String(req.body.username || '').trim().toLowerCase();
      const user = await User.findOne({ username });
      const passwordOk = user && await bcrypt.compare(String(req.body.password || ''), user.passwordHash);
      if (!passwordOk) return res.status(401).json({ error: 'Invalid username or password.' });
      if (user.mfaEnabled) {
        const otp = String(req.body.otp || '');
        if (!otp) {
          req.session.pendingMfaUserId = String(user._id);
          return res.json({ mfaRequired: true });
        }
        const codeOk = authenticator.verify({ token: otp.replace(/\s+/g, ''), secret: decryptSecret(user.mfaSecret, secret) });
        if (!codeOk) return res.status(401).json({ error: 'Invalid authentication code.', mfaRequired: true });
      }
      delete req.session.pendingMfaUserId;
      await startSession(req, user);
      await kickCatalog(user.tenantId, false);
      res.json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('ohcm.sid');
      res.json({ ok: true });
    });
  });

  app.get('/api/auth/me', (req, res) => {
    if (!req.session || !req.session.user) return res.json({ user: null });
    res.json({ user: req.session.user });
  });

  app.get('/api/profile', requireUser, async (req, res, next) => {
    try {
      const user = await User.findOne({ _id: req.auth.userId, tenantId: req.auth.tenantId });
      const applications = await Application.find({ tenantId: req.auth.tenantId, userId: req.auth.userId }).sort({ updatedAt: -1 }).limit(50);
      res.json({ resume: presentResume(user && user.resume), applications: applications.map(presentApplication) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/profile/resume', requireUser, requireWriter, express.raw({
    type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    limit: '5mb',
  }), async (req, res, next) => {
    try {
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const fileName = resumeFileName(req.headers['x-file-name'], contentType);
      if (!fileName || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Upload a PDF or Word resume, up to 5 MB.' });
      }
      const user = await User.findOne({ _id: req.auth.userId, tenantId: req.auth.tenantId });
      if (!user) return res.status(401).json({ error: 'Sign in again.' });
      const storageKey = `tenants/${req.auth.tenantId}/users/${req.auth.userId}/resume`;
      await storage.put(storageKey, req.body, contentType);
      user.resume = { fileName, contentType, bytes: req.body.length, storageKey, uploadedAt: new Date() };
      await user.save();
      res.json({ resume: presentResume(user.resume) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/profile/resume', requireUser, async (req, res, next) => {
    try {
      const user = await User.findOne({ _id: req.auth.userId, tenantId: req.auth.tenantId });
      if (!user || !user.resume || !user.resume.storageKey) return res.status(404).json({ error: 'Upload a resume first.' });
      const body = storage.getBuffer ? await storage.getBuffer(user.resume.storageKey) : null;
      if (!body) return res.status(404).json({ error: 'The saved resume file is missing.' });
      res.setHeader('Content-Type', user.resume.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${user.resume.fileName.replace(/"/g, '')}"`);
      res.send(body);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/mfa/enroll', requireUser, async (req, res, next) => {
    try {
      const mfaSecret = authenticator.generateSecret();
      req.session.pendingMfaSecret = mfaSecret;
      const otpauth = authenticator.keyuri(req.auth.username, 'SLP Oracle HCM Opportunities', mfaSecret);
      const qr = await QRCode.toDataURL(otpauth);
      res.json({ otpauth, qr });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/mfa/confirm', requireUser, async (req, res, next) => {
    try {
      const pending = req.session.pendingMfaSecret;
      if (!pending) return res.status(400).json({ error: 'Start MFA enrollment first.' });
      const otp = String(req.body.otp || '');
      if (!authenticator.verify({ token: otp.replace(/\s+/g, ''), secret: pending })) {
        return res.status(400).json({ error: 'That code did not match.' });
      }
      const user = await User.findById(req.auth.userId);
      user.mfaEnabled = true;
      user.mfaSecret = encryptSecret(pending, secret);
      await user.save();
      delete req.session.pendingMfaSecret;
      req.session.user = publicUser(user);
      res.json({ user: publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/opportunities', requireUser, async (req, res, next) => {
    try {
      const filter = opportunityFilter(req.auth.tenantId, req.query);
      const limit = Math.min(Number(req.query.limit) || 100, 100);
      const skip = Math.max(Number(req.query.skip) || 0, 0);
      const viewer = await User.findById(req.auth.userId);
      const seenAt = viewer && viewer.lastFeedSeenAt ? new Date(viewer.lastFeedSeenAt) : null;
      let items;
      let total;
      if (needsDerivedFilter(req.query)) {
        const pool = await Opportunity.find(filter).sort({ lastSeenAt: -1 }).limit(500);
        const scoped = pool.filter((item) => matchesDerived(item, req.query));
        total = scoped.length;
        items = scoped.slice(skip, skip + limit);
      } else {
        [items, total] = await Promise.all([
          Opportunity.find(filter).sort({ lastSeenAt: -1 }).skip(skip).limit(limit),
          Opportunity.countDocuments(filter),
        ]);
      }
      const saved = await SavedOpportunity.find({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: { $in: items.map((item) => item._id) },
      });
      const savedById = new Map(saved.map((item) => [String(item.opportunityId), item]));
      const sourceRows = await EmployerSource.find({ tenantId: req.auth.tenantId, synthetic: { $ne: true } }).select('name adapterType status');
      const sourceById = new Map(sourceRows.map((source) => [String(source._id), source]));
      const started = await kickCatalog(req.auth.tenantId, false);
      const coverage = await coverageSummary(req.auth.tenantId);
      res.json({
        total,
        scope: req.query.scope === 'usa' ? 'usa' : 'any',
        seenAt,
        coverage,
        sources: sourceRows
          .filter((source) => source.status !== 'unsupported')
          .map((source) => ({ id: String(source._id), name: source.name, adapterType: source.adapterType }))
          .sort((left, right) => (left.adapterType === 'dice-mcp' ? -1 : right.adapterType === 'dice-mcp' ? 1 : left.name.localeCompare(right.name))),
        opportunities: items.map((item) => {
          const source = sourceById.get(String(item.sourceId));
          return presentOpportunity(item, savedById.get(String(item._id)), {
            isNew: !!(seenAt && item.firstSeenAt && new Date(item.firstSeenAt) > seenAt),
            sourceName: source ? source.name : '',
            adapterType: source ? source.adapterType : '',
          });
        }),
        collection: {
          refreshing: started || catalogRefreshRunning(req.auth.tenantId),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/feed/seen', requireUser, requireWriter, async (req, res, next) => {
    try {
      await User.updateOne({ _id: req.auth.userId }, { $set: { lastFeedSeenAt: new Date() } });
      res.json({ seenAt: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/opportunities/:id/classification', requireUser, requireWriter, async (req, res, next) => {
    try {
      const opportunity = await Opportunity.findOne({ _id: req.params.id, tenantId: req.auth.tenantId });
      if (!opportunity) return res.status(404).json({ error: 'Opportunity not found.' });
      if (!EMPLOYER_TYPES.includes(req.body.employerType) || !HIRING_RELATIONSHIPS.includes(req.body.hiringRelationship)) {
        return res.status(400).json({ error: 'Choose an employer type and a hiring relationship.' });
      }
      opportunity.employerType = req.body.employerType;
      opportunity.hiringRelationship = req.body.hiringRelationship;
      opportunity.classificationCorrected = true;
      opportunity.classificationEvidence = String(req.body.evidence || 'Corrected manually on this account.').slice(0, 500);
      await opportunity.save();
      res.json({ opportunity: presentOpportunity(opportunity) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/opportunities/:id', requireUser, async (req, res, next) => {
    try {
      const opportunity = await Opportunity.findOne({ _id: req.params.id, tenantId: req.auth.tenantId });
      if (!opportunity) return res.status(404).json({ error: 'Opportunity not found.' });
      const saved = await SavedOpportunity.findOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: opportunity._id,
      });
      const source = await EmployerSource.findOne({ _id: opportunity.sourceId, tenantId: req.auth.tenantId });
      const application = await Application.findOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: opportunity._id,
      });
      const user = await User.findOne({ _id: req.auth.userId, tenantId: req.auth.tenantId });
      const outreach = await EmailOutreach.find({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: opportunity._id,
      });
      res.json({
        opportunity: presentOpportunity(opportunity, saved, {
          sourceName: source ? source.name : '',
          adapterType: source ? source.adapterType : '',
        }),
        source: source ? presentSource(source) : null,
        application: application ? presentApplication(application) : null,
        resume: presentResume(user && user.resume),
        emailOutreach: outreach.map((item) => ({
          email: item.email,
          sentAt: item.sentAt || null,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  async function queueView(tenantId, userId) {
    const items = await ApplyQueueItem.find({ tenantId, userId }).sort({ position: 1, createdAt: 1 });
    const opportunities = await Opportunity.find({
      tenantId,
      _id: { $in: items.map((item) => item.opportunityId) },
    });
    const byId = new Map(opportunities.map((opportunity) => [String(opportunity._id), opportunity]));
    const user = await User.findOne({ _id: userId, tenantId });
    return {
      resume: presentResume(user && user.resume),
      items: items.map((item) => {
        const opportunity = byId.get(String(item.opportunityId));
        return {
          id: String(item._id),
          opportunityId: String(item.opportunityId),
          state: item.state,
          position: item.position,
          title: opportunity ? opportunity.title : 'Listing no longer stored',
          employerName: opportunity ? opportunity.employerName : '',
          url: opportunity && opportunity.canonicalUrl ? opportunity.canonicalUrl : null,
        };
      }),
    };
  }

  function nextQueuedItem(queue, currentOpportunityId) {
    return queue.items.find((item) => item.state === 'queued' && item.opportunityId !== String(currentOpportunityId)) || null;
  }

  async function openEmployerPosting(auth, opportunityId) {
    const user = await User.findOne({ _id: auth.userId, tenantId: auth.tenantId });
    if (!user || !user.resume || !user.resume.storageKey) {
      const error = new Error('Upload a resume before opening an application.');
      error.status = 400;
      throw error;
    }
    const opportunity = await Opportunity.findOne({ _id: opportunityId, tenantId: auth.tenantId });
    if (!opportunity) {
      const error = new Error('Opportunity not found.');
      error.status = 404;
      throw error;
    }
    if (!opportunity.canonicalUrl) {
      const error = new Error('This posting did not publish an application URL.');
      error.status = 400;
      throw error;
    }
    const existing = await Application.findOne({
      tenantId: auth.tenantId,
      userId: auth.userId,
      opportunityId: opportunity._id,
    });
    if (existing && existing.status === 'submitted_by_me') {
      return {
        application: existing,
        url: opportunity.canonicalUrl,
        alreadySubmitted: true,
        note: 'You already marked this as submitted on the employer site. Opening the page again does not send another application.',
      };
    }
    const now = new Date();
    const application = await Application.findOneAndUpdate(
      { tenantId: auth.tenantId, userId: auth.userId, opportunityId: opportunity._id },
      {
        $set: {
          status: 'opened_employer_site',
          employerUrl: opportunity.canonicalUrl,
          resumeFileName: user.resume.fileName,
          openedAt: now,
        },
        $setOnInsert: { tenantId: auth.tenantId, userId: auth.userId, opportunityId: opportunity._id },
      },
      { upsert: true, new: true }
    );
    return {
      application,
      url: opportunity.canonicalUrl,
      alreadySubmitted: false,
      note: 'This opens the employer posting. Attach the resume saved in this account. This app does not submit the form.',
    };
  }

  app.post('/api/opportunities/:id/apply', requireUser, requireWriter, async (req, res, next) => {
    try {
      const opened = await openEmployerPosting(req.auth, req.params.id);
      res.json({
        application: presentApplication(opened.application),
        url: opened.url,
        note: opened.note,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/apply-queue', requireUser, async (req, res, next) => {
    try {
      res.json(await queueView(req.auth.tenantId, req.auth.userId));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/apply-queue', requireUser, requireWriter, async (req, res, next) => {
    try {
      const opportunity = await Opportunity.findOne({ _id: req.body.opportunityId, tenantId: req.auth.tenantId });
      if (!opportunity) return res.status(404).json({ error: 'Opportunity not found.' });
      if (!opportunity.canonicalUrl) return res.status(400).json({ error: 'This posting did not publish an application URL.' });
      const existing = await ApplyQueueItem.findOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: opportunity._id,
      });
      if (existing && existing.state === 'submitted') {
        return res.status(409).json({ error: 'You already marked this posting as submitted.' });
      }
      if (existing && (existing.state === 'queued' || existing.state === 'opened')) {
        return res.json(await queueView(req.auth.tenantId, req.auth.userId));
      }
      const last = await ApplyQueueItem.findOne({ tenantId: req.auth.tenantId, userId: req.auth.userId }).sort({ position: -1 });
      const position = last ? last.position + 1 : 1;
      if (existing) {
        existing.state = 'queued';
        existing.position = position;
        await existing.save();
      } else {
        await ApplyQueueItem.create({
          tenantId: req.auth.tenantId,
          userId: req.auth.userId,
          opportunityId: opportunity._id,
          position,
          state: 'queued',
        });
      }
      res.status(201).json(await queueView(req.auth.tenantId, req.auth.userId));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/apply-queue/:opportunityId', requireUser, requireWriter, async (req, res, next) => {
    try {
      const item = await ApplyQueueItem.findOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: req.params.opportunityId,
      });
      if (!item) return res.status(404).json({ error: 'That posting is not in the apply queue.' });
      if (item.state === 'submitted') return res.status(409).json({ error: 'A posting you marked as submitted stays in the queue record.' });
      await item.deleteOne();
      res.json(await queueView(req.auth.tenantId, req.auth.userId));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/apply-queue/:opportunityId/open', requireUser, requireWriter, async (req, res, next) => {
    try {
      const item = await ApplyQueueItem.findOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: req.params.opportunityId,
      });
      if (!item) return res.status(404).json({ error: 'That posting is not in the apply queue.' });
      const opened = await openEmployerPosting(req.auth, req.params.opportunityId);
      item.state = opened.alreadySubmitted ? 'submitted' : 'opened';
      await item.save();
      const queue = await queueView(req.auth.tenantId, req.auth.userId);
      res.json({
        application: presentApplication(opened.application),
        url: opened.url,
        note: opened.note,
        next: nextQueuedItem(queue, req.params.opportunityId),
        queue,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/apply-queue/:opportunityId/submitted', requireUser, requireWriter, async (req, res, next) => {
    try {
      const item = await ApplyQueueItem.findOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: req.params.opportunityId,
      });
      if (!item) return res.status(404).json({ error: 'That posting is not in the apply queue.' });
      const application = await Application.findOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: req.params.opportunityId,
      });
      if (!application) return res.status(404).json({ error: 'Open the employer posting first.' });
      application.status = 'submitted_by_me';
      application.submittedAt = new Date();
      await application.save();
      item.state = 'submitted';
      await item.save();
      const queue = await queueView(req.auth.tenantId, req.auth.userId);
      res.json({
        application: presentApplication(application),
        next: nextQueuedItem(queue, req.params.opportunityId),
        queue,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/apply-queue/:opportunityId/skip', requireUser, requireWriter, async (req, res, next) => {
    try {
      const item = await ApplyQueueItem.findOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: req.params.opportunityId,
      });
      if (!item) return res.status(404).json({ error: 'That posting is not in the apply queue.' });
      if (item.state !== 'submitted') item.state = 'skipped';
      await item.save();
      const queue = await queueView(req.auth.tenantId, req.auth.userId);
      res.json({
        next: nextQueuedItem(queue, req.params.opportunityId),
        queue,
      });
    } catch (error) {
      next(error);
    }
  });

  async function draftForAccount(auth, opportunityId) {
    const user = await User.findOne({ _id: auth.userId, tenantId: auth.tenantId });
    if (!user || !user.resume || !user.resume.storageKey) {
      const error = new Error('Upload a resume before preparing an email.');
      error.status = 400;
      throw error;
    }
    const opportunity = await Opportunity.findOne({ _id: opportunityId, tenantId: auth.tenantId, synthetic: false });
    if (!opportunity) {
      const error = new Error('Opportunity not found.');
      error.status = 404;
      throw error;
    }
    const draft = emailDraft(opportunity, user.resume.fileName);
    if (!draft) {
      const error = new Error('This posting does not publish an email address.');
      error.status = 404;
      throw error;
    }
    const existing = await EmailOutreach.findOne({
      tenantId: auth.tenantId,
      userId: auth.userId,
      opportunityId: opportunity._id,
      email: draft.email,
    });
    return { user, opportunity, draft, existing };
  }

  app.post('/api/opportunities/:id/email-draft', requireUser, requireWriter, async (req, res, next) => {
    try {
      const { draft, existing } = await draftForAccount(req.auth, req.params.id);
      res.json({
        ...draft,
        alreadySent: !!existing,
        note: existing
          ? 'You already recorded an email to this address. Opening the draft again does not send another message.'
          : draft.note,
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/opportunities/:id/email-sent', requireUser, requireWriter, async (req, res, next) => {
    try {
      const { user, opportunity, draft, existing } = await draftForAccount(req.auth, req.params.id);
      if (existing) {
        return res.status(409).json({ error: 'You already recorded an email to this address.' });
      }
      const saved = await EmailOutreach.create({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: opportunity._id,
        email: draft.email,
        resumeFileName: user.resume.fileName,
        sentAt: new Date(),
      });
      res.status(201).json({
        email: saved.email,
        sentAt: saved.sentAt,
        note: 'You marked this email as sent by you. Nothing was sent from this app.',
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/opportunities/:id/apply/submitted', requireUser, requireWriter, async (req, res, next) => {
    try {
      const application = await Application.findOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: req.params.id,
      });
      if (!application) return res.status(404).json({ error: 'Open the employer application first.' });
      application.status = 'submitted_by_me';
      application.submittedAt = new Date();
      await application.save();
      res.json({ application: presentApplication(application) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/opportunities/:id/save', requireUser, requireWriter, async (req, res, next) => {
    try {
      const opportunity = await Opportunity.findOne({ _id: req.params.id, tenantId: req.auth.tenantId });
      if (!opportunity) return res.status(404).json({ error: 'Opportunity not found.' });
      const personalStatus = allowedStatus(req.body.personalStatus);
      const saved = await SavedOpportunity.findOneAndUpdate(
        { tenantId: req.auth.tenantId, userId: req.auth.userId, opportunityId: opportunity._id },
        {
          $set: {
            personalStatus,
            notes: String(req.body.notes || '').slice(0, 2000),
          },
          $setOnInsert: {
            tenantId: req.auth.tenantId,
            userId: req.auth.userId,
            opportunityId: opportunity._id,
          },
        },
        { upsert: true, new: true }
      );
      res.json({
        saved: true,
        personalStatus: saved.personalStatus,
        note: 'Personal tracking only. This application does not submit applications or contact employers.',
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/saved', requireUser, async (req, res, next) => {
    try {
      const saved = await SavedOpportunity.find({ tenantId: req.auth.tenantId, userId: req.auth.userId }).sort({ updatedAt: -1 });
      const opportunities = await Opportunity.find({
        tenantId: req.auth.tenantId,
        _id: { $in: saved.map((item) => item.opportunityId) },
      });
      const byId = new Map(opportunities.map((item) => [String(item._id), item]));
      res.json({
        saved: saved.filter((item) => byId.has(String(item.opportunityId))).map((item) => ({
          ...presentOpportunity(byId.get(String(item.opportunityId)), item),
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/saved/:id', requireUser, requireWriter, async (req, res, next) => {
    try {
      await SavedOpportunity.deleteOne({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        opportunityId: req.params.id,
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/saved-searches', requireUser, async (req, res, next) => {
    try {
      const searches = await SavedSearch.find({ tenantId: req.auth.tenantId, userId: req.auth.userId }).sort({ updatedAt: -1 });
      res.json({ searches: searches.map(presentSearch) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/saved-searches', requireUser, requireWriter, async (req, res, next) => {
    try {
      const name = String(req.body.name || '').trim().slice(0, 80);
      if (!name) return res.status(400).json({ error: 'Name the search.' });
      const search = await SavedSearch.create({
        tenantId: req.auth.tenantId,
        userId: req.auth.userId,
        name,
        filters: sanitizeFilters(req.body.filters || {}),
      });
      res.status(201).json({ search: presentSearch(search) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/saved-searches/:id', requireUser, requireWriter, async (req, res, next) => {
    try {
      await SavedSearch.deleteOne({ _id: req.params.id, tenantId: req.auth.tenantId, userId: req.auth.userId });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/sources', requireUser, async (req, res, next) => {
    try {
      const sources = await EmployerSource.find({ tenantId: req.auth.tenantId, synthetic: { $ne: true } }).sort({ name: 1 });
      const credentials = await MemberCredential.find({ tenantId: req.auth.tenantId, userId: req.auth.userId });
      const bySource = new Map(credentials.map((credential) => [String(credential.sourceId), credential]));
      res.json({ sources: sources.map((source) => presentSource(source, bySource.get(String(source._id)))) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/sources', requireUser, requireWriter, async (req, res, next) => {
    try {
      const payload = sourcePayload(req.body);
      const source = await EmployerSource.create({
        ...payload,
        tenantId: req.auth.tenantId,
        employerKey: employerKey(payload.domain),
        status: resolvedStatus(payload),
      });
      res.status(201).json({ source: presentSource(source) });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/sources/:id', requireUser, requireWriter, async (req, res, next) => {
    try {
      const source = await EmployerSource.findOne({ _id: req.params.id, tenantId: req.auth.tenantId });
      if (!source) return res.status(404).json({ error: 'Source not found.' });
      const payload = sourcePayload({ ...source.toObject(), ...req.body, adapterConfig: { ...(source.adapterConfig || {}), ...(req.body.adapterConfig || {}) } });
      Object.assign(source, payload, { employerKey: employerKey(payload.domain), status: resolvedStatus(payload) });
      await source.save();
      res.json({ source: presentSource(source) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/catalog/refresh', requireUser, requireWriter, async (req, res, next) => {
    try {
      if (!autoCollect) return res.json({ started: false });
      const started = await kickCatalog(req.auth.tenantId, true);
      res.status(202).json({ started, refreshing: started || catalogRefreshRunning(req.auth.tenantId) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/sources/:id/credentials', requireUser, requireWriter, async (req, res, next) => {
    try {
      const source = await EmployerSource.findOne({ _id: req.params.id, tenantId: req.auth.tenantId });
      if (!source) return res.status(404).json({ error: 'Source not found.' });
      const site = memberSite(source.catalogKey);
      if (!site) return res.status(400).json({ error: 'This source does not take a contract-site sign-in.' });
      const username = String(req.body.username || '').trim();
      const password = String(req.body.password || '');
      if (username.length < 1 || username.length > 120) return res.status(400).json({ error: 'Enter the username for this site.' });
      if (password.length < 1 || password.length > 200) return res.status(400).json({ error: 'Enter the password for this site.' });
      let loginUrl;
      try {
        loginUrl = assertSafeOutboundUrl(source.careerSiteUrl).toString();
      } catch {
        return res.status(400).json({ error: 'This source has no sign-in page.' });
      }
      if (new URL(loginUrl).host !== site.host) return res.status(400).json({ error: 'This source has no sign-in page.' });
      let result = { status: 'unavailable', message: 'Sign-in was saved. The site did not return a sign-in form.' };
      try {
        result = await attemptMemberLogin({ loginUrl, username, password, fetchImpl: options.fetchImpl });
      } catch {
        result = { status: 'unavailable', message: 'Sign-in was saved. The site did not accept an automated sign-in.' };
      }
      const saved = await MemberCredential.findOneAndUpdate(
        { tenantId: req.auth.tenantId, userId: req.auth.userId, sourceId: source._id },
        {
          tenantId: req.auth.tenantId,
          userId: req.auth.userId,
          sourceId: source._id,
          catalogKey: source.catalogKey,
          username,
          passwordEncrypted: encryptSecret(password, secret),
          lastLoginStatus: result.status,
          lastLoginMessage: result.message,
          lastLoginAt: new Date(),
        },
        { upsert: true, new: true }
      );
      res.json({ source: presentSource(source, saved), loginStatus: result.status, loginMessage: result.message });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/sources/:id/refresh', requireUser, requireWriter, async (req, res, next) => {
    try {
      const source = await EmployerSource.findOne({ _id: req.params.id, tenantId: req.auth.tenantId });
      if (!source) return res.status(404).json({ error: 'Source not found.' });
      if (!['enabled', 'failing'].includes(source.status)) {
        return res.status(409).json({ error: 'Enable the source before refresh. Paused and unsupported sources are not collected.' });
      }
      if (process.env.NODE_ENV !== 'test' && source.lastRunAt && Date.now() - new Date(source.lastRunAt).getTime() < 60 * 1000) {
        return res.status(429).json({ error: 'This source was refreshed less than a minute ago.' });
      }
      if (redisUrl() && options.inlineJobs !== true && process.env.NODE_ENV !== 'test') {
        const queue = createBullQueue();
        await queue.add('source.refresh', {
          sourceId: String(source._id),
          tenantId: String(source.tenantId),
        }, { jobId: `refresh-${source._id}`, attempts: 5 });
        await queue.close();
        return res.status(202).json({ queued: true });
      }
      const run = await refreshSource(source, fetchDeps(options, storage));
      res.json({ run: presentRun(run) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/imports/url', requireUser, requireWriter, async (req, res, next) => {
    try {
      const url = String(req.body.url || '').trim();
      assertSafeOutboundUrl(url, { allowHttp: process.env.NODE_ENV !== 'production' });
      const domain = employerKey(req.body.domain || new URL(url).hostname);
      const name = String(req.body.employerName || domain).slice(0, 160);
      let source = await EmployerSource.findOne({ tenantId: req.auth.tenantId, employerKey: domain, adapterType: 'manual' });
      if (!source) {
        source = await EmployerSource.create({
          tenantId: req.auth.tenantId,
          name,
          domain,
          employerKey: domain,
          careerSiteUrl: url,
          atsProvider: 'unknown',
          adapterType: 'manual',
          ownership: ['direct_employer', 'staffing_company', 'unknown'].includes(req.body.ownership) ? req.body.ownership : 'unknown',
          accessMethod: 'manual',
          accessNotes: 'Single public URL import. This does not snapshot the employer career site.',
          termsReviewStatus: 'not_reviewed',
          status: 'paused',
          adapterConfig: {},
        });
      }
      const partial = await importPublicUrl(url, fetchDeps(options, storage));
      const applied = await applyListing(source, partial, { now: new Date(), storage });
      const opportunity = await Opportunity.findOne({ _id: applied.id, tenantId: req.auth.tenantId });
      res.status(applied.created ? 201 : 200).json({
        opportunity: presentOpportunity(opportunity),
        source: presentSource(source),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/discovery', requireUser, async (req, res, next) => {
    try {
      res.json(await discoveryReport(req.auth.tenantId));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/discovery/search', requireUser, requireWriter, (req, res) => {
    const search = searchProviderStatus();
    if (!search.configured) return res.status(503).json({ error: search.message, search });
    return res.status(501).json({
      error: 'Search settings are present, but this app does not send the query until that provider’s response format is recorded. Import an official careers URL instead.',
      search,
    });
  });

  app.post('/api/discovery/import', requireUser, requireWriter, async (req, res, next) => {
    try {
      const queueDiscovery = redisUrl() && options.inlineJobs !== true && process.env.NODE_ENV !== 'test';
      const lead = await importEmployer(req.auth.tenantId, req.body || {}, fetchDeps(options, storage), { deferResolve: queueDiscovery });
      if (queueDiscovery) {
        const queue = createBullQueue();
        await queue.add('discovery.resolve', {
          leadId: String(lead._id),
          tenantId: String(lead.tenantId),
        }, { jobId: `discover-${lead._id}`, attempts: 3 });
        await queue.close();
        return res.status(202).json({ queued: true, lead: { id: String(lead._id), name: lead.name, connectorStatus: 'candidate' } });
      }
      res.status(201).json({
        queued: false,
        lead: {
          id: String(lead._id),
          name: lead.name,
          connectorStatus: lead.connectorStatus,
          platform: lead.platform || '',
          boardIdentifier: lead.boardIdentifier || '',
          resolvedBoardUrl: lead.resolvedBoardUrl || '',
          connectorReason: lead.connectorReason || '',
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/collection/runs', requireUser, async (req, res, next) => {
    try {
      const runs = await CollectionRun.find({ tenantId: req.auth.tenantId }).sort({ startedAt: -1 }).limit(100);
      res.json({ runs: runs.map(presentRun) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/collection/health', requireUser, async (req, res, next) => {
    try {
      const sources = await EmployerSource.find({ tenantId: req.auth.tenantId, synthetic: { $ne: true } });
      const counts = { enabled: 0, paused: 0, unsupported: 0, failing: 0 };
      for (const source of sources) counts[source.status] = (counts[source.status] || 0) + 1;
      const latest = await CollectionRun.find({ tenantId: req.auth.tenantId }).sort({ startedAt: -1 }).limit(8);
      res.json({ counts, sources: sources.map(presentSource), runs: latest.map(presentRun) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/review', requireUser, async (req, res, next) => {
    try {
      const items = await Opportunity.find({
        tenantId: req.auth.tenantId,
        'reviewFlags.0': { $exists: true },
      }).sort({ updatedAt: -1 }).limit(100);
      res.json({ opportunities: items.map((item) => presentOpportunity(item)) });
    } catch (error) {
      next(error);
    }
  });

  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.name === 'CastError') return res.status(400).json({ error: 'Invalid id.' });
    if (error.name === 'SourceFetchError' || error.name === 'UnsafeUrlError') {
      return res.status(error.status || 502).json({ error: error.message });
    }
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : error.message });
  });

  return app;
}

function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      req.session.user = publicUser(user);
      req.session.save((saveError) => (saveError ? reject(saveError) : resolve()));
    });
  });
}

function allowedStatus(value) {
  const allowed = ['saved', 'interested', 'contacting_offline', 'interviewing', 'not_pursuing'];
  return allowed.includes(value) ? value : 'saved';
}

function presentSearch(search) {
  return { id: String(search._id), name: search.name, filters: search.filters || {} };
}

function presentRun(run) {
  return {
    id: String(run._id),
    sourceId: String(run.sourceId),
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
    error: run.error || '',
    pages: run.pages || 0,
    fetched: run.fetched || 0,
    created: run.created || 0,
    updated: run.updated || 0,
    removed: run.removed || 0,
    requests: run.requests || 0,
    completeness: run.completeness || null,
    warnings: run.warnings || [],
    stages: run.stages || [],
  };
}

function yearFilter(value) {
  if (value == null || value === '') return '';
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 60) return '';
  return String(number);
}

function sanitizeFilters(filters) {
  const source = filters && typeof filters === 'object' ? filters : {};
  return {
    q: String(source.q || '').slice(0, 80),
    employmentType: String(source.employmentType || ''),
    workplace: String(source.workplace || ''),
    module: String(source.module || ''),
    roleCategory: String(source.roleCategory || ''),
    platform: String(source.platform || ''),
    listingStatus: String(source.listingStatus || ''),
    location: String(source.location || '').slice(0, 80),
    scope: String(source.scope || ''),
    engagement: String(source.engagement || ''),
    employerType: String(source.employerType || ''),
    hiringRelationship: String(source.hiringRelationship || ''),
    relationship: String(source.relationship || ''),
    schedule: String(source.schedule || ''),
    postedAfter: String(source.postedAfter || '').slice(0, 10),
    postedBefore: String(source.postedBefore || '').slice(0, 10),
    discoveredAfter: String(source.discoveredAfter || '').slice(0, 10),
    discoveredBefore: String(source.discoveredBefore || '').slice(0, 10),
    experienceMin: yearFilter(source.experienceMin),
    experienceMax: yearFilter(source.experienceMax),
    excludeSource: String(source.excludeSource || '').slice(0, 400),
    directEndClient: source.directEndClient === true || source.directEndClient === 'true' ? 'true' : '',
  };
}

async function coverageSummary(tenantId) {
  const sources = await EmployerSource.find({ tenantId, synthetic: { $ne: true } });
  const live = { tenantId, synthetic: { $ne: true } };
  const [docs, unverified, unknownPostedDate] = await Promise.all([
    Opportunity.find(live).select('synthetic listingStatus applicationOpen oracle.platform oracle.relevance employerType employerName employmentType engagement workingTime employmentRelationship workSchedule workplace locations geography publishedAt publishedAtStatus reviewFlags'),
    Opportunity.countDocuments({ ...live, $or: [{ listingStatus: 'unknown' }, { presenceConfidence: 'unverified' }, { applicationOpen: 'not_established' }] }),
    Opportunity.countDocuments({ ...live, publishedAtStatus: { $ne: 'published' } }),
  ]);
  const reconciled = reconcileListings(docs, sources);
  return {
    ...reconciled,
    configured: sources.length,
    checked: reconciled.checkedBoards,
    failing: reconciled.failingBoards,
    unsupported: reconciled.unsupportedBoards,
    verifiedActive: reconciled.sourceListedActive,
    unverified,
    unknownPostedDate,
  };
}

function opportunityFilter(tenantId, query) {
  const filter = { tenantId };
  if (query.platform) filter['oracle.platform'] = { $in: String(query.platform).split(',').map((item) => item.trim()).filter(Boolean) };
  if (query.employmentType) filter.employmentType = String(query.employmentType);
  if (query.workplace) filter.workplace = String(query.workplace);
  if (query.module) filter['oracle.modules'] = String(query.module);
  if (query.roleCategory) filter['oracle.roleCategory'] = String(query.roleCategory);
  if (query.listingStatus) filter.listingStatus = String(query.listingStatus);
  if (query.engagement) filter.engagement = String(query.engagement);
  if (query.workingTime) filter.workingTime = String(query.workingTime);
  if (query.big5 === 'true') {
    filter.employerKey = { $in: ['accenture.com', 'deloitte.com', 'ey.com', 'pwc.com', 'kpmg.com'] };
  } else if (query.employer) filter.employerKey = employerKey(query.employer);
  if (query.hiringContext === 'direct_client' || query.hiringContext === 'consulting_firm') {
    filter.hiringContext = query.hiringContext;
  }
  if (query.directEndClient === 'true') {
    filter.employerType = 'end_user';
    filter.hiringRelationship = 'own_team';
  } else {
    if (EMPLOYER_TYPES.includes(query.employerType)) filter.employerType = query.employerType;
    if (HIRING_RELATIONSHIPS.includes(query.hiringRelationship)) filter.hiringRelationship = query.hiringRelationship;
  }
  filter.synthetic = false;
  if (query.location) filter['locations.label'] = new RegExp(escapeRegex(query.location), 'i');
  const excludedSources = String(query.excludeSource || '').split(',').map((item) => item.trim()).filter((id) => /^[a-f0-9]{24}$/i.test(id));
  if (excludedSources.length) filter.sourceId = { $nin: excludedSources };
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: pattern }, { descriptionText: pattern }, { employerName: pattern }];
  }
  return filter;
}

function sourcePayload(body) {
  const domain = employerKey(body.domain || '');
  if (!domain) {
    const error = new Error('Employer domain is required.');
    error.status = 400;
    throw error;
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    const error = new Error('Enter the employer’s public domain, such as example.com.');
    error.status = 400;
    throw error;
  }
  if (!String(body.name || '').trim()) {
    const error = new Error('Employer name is required.');
    error.status = 400;
    throw error;
  }
  if (body.careerSiteUrl) assertSafeOutboundUrl(body.careerSiteUrl, { allowHttp: process.env.NODE_ENV !== 'production' });
  const adapterType = String(body.adapterType || 'manual');
  return {
    name: String(body.name).trim().slice(0, 160),
    domain,
    careerSiteUrl: body.careerSiteUrl ? String(body.careerSiteUrl).trim() : '',
    atsProvider: String(body.atsProvider || 'unknown').slice(0, 80),
    adapterType,
    ownership: ['direct_employer', 'staffing_company', 'unknown'].includes(body.ownership) ? body.ownership : 'unknown',
    accessMethod: ['public_api', 'public_page', 'manual'].includes(body.accessMethod) ? body.accessMethod : 'manual',
    accessDocumentationUrl: String(body.accessDocumentationUrl || '').slice(0, 300),
    accessNotes: String(body.accessNotes || '').slice(0, 1000),
    termsReviewStatus: ['not_reviewed', 'public_read_documented', 'blocked', 'rejected'].includes(body.termsReviewStatus)
      ? body.termsReviewStatus
      : 'not_reviewed',
    termsNotes: String(body.termsNotes || '').slice(0, 1000),
    refreshIntervalMinutes: Math.min(Math.max(Number(body.refreshIntervalMinutes) || 360, 15), 10080),
    status: ['enabled', 'paused', 'unsupported', 'failing'].includes(body.status) ? body.status : 'paused',
    adapterConfig: cleanConfig(body.adapterConfig),
    synthetic: false,
  };
}

function fetchDeps(options, storage) {
  const test = process.env.NODE_ENV === 'test';
  return {
    fetchImpl: options.fetchImpl,
    storage,
    sleep: options.sleep || (test ? async () => {} : undefined),
    retries: options.retries != null ? options.retries : (test ? 1 : 3),
    backoffMs: options.backoffMs != null ? options.backoffMs : (test ? 0 : 500),
    pageLimit: options.pageLimit,
    maxPages: options.maxPages,
    minIntervalMs: options.minIntervalMs != null ? options.minIntervalMs : (test ? 0 : undefined),
    afterEach: options.afterEach,
  };
}

module.exports = {
  createApp,
};
