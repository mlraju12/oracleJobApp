const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/createApp');
const { EmployerSource, MemberCredential } = require('../src/models');
const { decryptSecret } = require('../src/services/platform');
const { passwordForm, attemptMemberLogin } = require('../src/services/memberLogin');

function page(body, status = 200, headers = {}) {
  return {
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    async text() { return body; },
  };
}

const SHELL = '<html><body><app-root></app-root></body></html>';
const FORM = '<form method="post" action="/session"><input type="hidden" name="csrf" value="abc"><input type="email" name="email"><input type="password" name="password"></form>';

describe('contract site sign-in', () => {
  test('does not submit a password when the page has no form', async () => {
    const calls = [];
    const result = await attemptMemberLogin({
      loginUrl: 'https://talentexchange.pwc.com/sign-in',
      username: 'member@example.com',
      password: 'secret-value',
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method, body: init.body || '' });
        return page(SHELL);
      },
    });
    expect(result.status).toBe('unavailable');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].body).not.toContain('secret-value');
  });

  test('posts the password only to the same site', async () => {
    const calls = [];
    const result = await attemptMemberLogin({
      loginUrl: 'https://talentexchange.pwc.com/sign-in',
      username: 'member@example.com',
      password: 'secret-value',
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method, body: init.body || '' });
        if (init.method === 'POST') return page('<html><body>Account</body></html>', 302, { location: 'https://talentexchange.pwc.com/search-all-contractor-roles' });
        return page(FORM);
      },
    });
    expect(result.status).toBe('signed_in');
    expect(calls[1].url).toBe('https://talentexchange.pwc.com/session');
    expect(calls[1].body).toContain('email=member%40example.com');
    expect(calls[1].body).toContain('password=secret-value');
    expect(result.message).not.toContain('secret-value');
  });

  test('refuses a form that would send the password to another host', () => {
    const form = passwordForm('<form method="post" action="https://evil.example/login"><input name="email"><input type="password" name="password"></form>', 'https://talentexchange.pwc.com/sign-in');
    expect(form).toBeNull();
  });
});

describe('contract site credential route', () => {
  let mongod;
  let app;
  let token;
  let agent;
  const calls = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'test-session-secret-value';
    mongod = await MongoMemoryServer.create();
    app = await createApp({
      mongoUri: mongod.getUri(),
      inlineJobs: true,
      storageDriver: 'memory',
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), body: init && init.body ? String(init.body) : '' });
        return page(SHELL);
      },
    });
    agent = request.agent(app);
    const health = await agent.get('/api/health');
    const cookies = health.headers['set-cookie'] || [];
    token = cookies.find((cookie) => cookie.startsWith('XSRF-TOKEN=')).split(';')[0].split('=')[1];
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  function post(url, body) {
    return agent.post(url).set('x-xsrf-token', token).send(body);
  }

  test('stores the password encrypted and leaves it out of the response', async () => {
    const registered = await post('/api/auth/register', { username: 'ada.login', password: 'test-password-1' });
    expect(registered.status).toBe(201);
    const source = await EmployerSource.create({
      tenantId: registered.body.user.tenantId,
      name: 'PwC Talent Exchange',
      domain: 'pwc.com',
      employerKey: 'pwc.com',
      careerSiteUrl: 'https://talentexchange.pwc.com/sign-in',
      adapterType: 'public-search',
      status: 'unsupported',
      catalogKey: 'public:pwc-talent-exchange',
    });
    const other = await EmployerSource.create({
      tenantId: registered.body.user.tenantId,
      name: 'PwC',
      domain: 'pwc.com',
      employerKey: 'pwc.com',
      careerSiteUrl: 'https://jobs-us.pwc.com/us/en/search-results',
      adapterType: 'public-search',
      status: 'enabled',
      catalogKey: 'public:pwc',
    });
    const password = 'contract-site-secret';
    const saved = await post(`/api/sources/${source._id}/credentials`, { username: 'member@example.com', password });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body)).not.toContain(password);
    expect(saved.body.source.savedUsername).toBe('member@example.com');
    expect(saved.body.loginStatus).toBe('unavailable');
    expect(calls.some((call) => String(call.body).includes(password))).toBe(false);
    const stored = await MemberCredential.findOne({ sourceId: source._id });
    expect(stored.passwordEncrypted).not.toBe(password);
    expect(decryptSecret(stored.passwordEncrypted, process.env.SESSION_SECRET)).toBe(password);
    const rejected = await post(`/api/sources/${other._id}/credentials`, { username: 'member@example.com', password });
    expect(rejected.status).toBe(400);
  });
});
