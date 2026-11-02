const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/createApp');

describe('production session cookie behind a proxy', () => {
  let mongod;
  let app;
  const priorEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'test-session-secret-value';
    mongod = await MongoMemoryServer.create();
    app = await createApp({
      mongoUri: mongod.getUri(),
      inlineJobs: true,
      storageDriver: 'memory',
      autoCollect: false,
    });
  }, 120000);

  afterAll(async () => {
    process.env.NODE_ENV = priorEnv;
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  async function csrf() {
    const health = await request(app).get('/api/health').set('x-forwarded-proto', 'https');
    const cookie = health.headers['set-cookie'].find((item) => item.startsWith('XSRF-TOKEN=')).split(';')[0];
    return { cookie, token: cookie.split('=')[1] };
  }

  test('sets the session cookie when the proxy says the request is HTTPS', async () => {
    const { cookie, token } = await csrf();
    const response = await request(app)
      .post('/api/auth/register')
      .set('x-forwarded-proto', 'https')
      .set('Cookie', cookie)
      .set('x-xsrf-token', token)
      .send({ username: 'heroku.user', password: 'test-password-1' });
    expect(response.status).toBe(201);
    const cookies = response.headers['set-cookie'] || [];
    expect(cookies.some((item) => item.startsWith('ohcm.sid='))).toBe(true);
  });

  test('does not set the session cookie on a plain HTTP request', async () => {
    const { cookie, token } = await csrf();
    const response = await request(app)
      .post('/api/auth/register')
      .set('Cookie', cookie)
      .set('x-xsrf-token', token)
      .send({ username: 'plain.http', password: 'test-password-1' });
    expect(response.status).toBe(201);
    const cookies = response.headers['set-cookie'] || [];
    expect(cookies.some((item) => item.startsWith('ohcm.sid='))).toBe(false);
  });
});
