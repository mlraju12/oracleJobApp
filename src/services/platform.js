const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function encryptSecret(plain, secret) {
  const key = crypto.scryptSync(String(secret), 'slp-ohcm-mfa', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function decryptSecret(payload, secret) {
  const buffer = Buffer.from(String(payload || ''), 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const key = crypto.scryptSync(String(secret), 'slp-ohcm-mfa', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function resolveDriver(env = process.env) {
  const explicit = String(env.OBJECT_STORAGE_DRIVER || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (env.S3_BUCKET) return 's3';
  if (env.NODE_ENV === 'test') return 'memory';
  return 'local';
}

function createMemoryStorage() {
  const objects = new Map();
  return {
    driver: 'memory',
    async put(key, body) {
      objects.set(key, Buffer.from(body));
      return { key, bytes: objects.get(key).length };
    },
    async get(key) {
      const value = objects.get(key);
      return value ? value.toString('utf8') : null;
    },
    async getBuffer(key) {
      const value = objects.get(key);
      return value ? Buffer.from(value) : null;
    },
  };
}

function createLocalStorage(rootDir) {
  const root = path.resolve(rootDir || path.join(process.cwd(), 'data', 'object-storage'));
  return {
    driver: 'local',
    async put(key, body) {
      const target = safePath(root, key);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
      return { key, bytes: Buffer.byteLength(body) };
    },
    async get(key) {
      const target = safePath(root, key);
      if (!fs.existsSync(target)) return null;
      return fs.readFileSync(target, 'utf8');
    },
    async getBuffer(key) {
      const target = safePath(root, key);
      if (!fs.existsSync(target)) return null;
      return fs.readFileSync(target);
    },
  };
}

function safePath(root, key) {
  const cleaned = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..')) throw new Error('Invalid evidence key.');
  const target = path.resolve(root, cleaned);
  if (!target.startsWith(root)) throw new Error('Invalid evidence key.');
  return target;
}

function createS3Storage(env = process.env) {
  const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
  const bucket = env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is required for the s3 storage driver.');
  const client = new S3Client({
    region: env.S3_REGION || 'us-east-1',
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    credentials: env.S3_ACCESS_KEY_ID
      ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY || '' }
      : undefined,
  });
  return {
    driver: 's3',
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType || 'application/json',
        ServerSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION || 'AES256',
      }));
      return { key, bytes: Buffer.byteLength(body) };
    },
    async get(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return response.Body.transformToString();
    },
    async getBuffer(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await response.Body.transformToByteArray());
    },
  };
}

function createStorage(options = {}) {
  if (options.storage) return options.storage;
  const driver = options.driver || resolveDriver(options.env || process.env);
  if (driver === 'memory') return createMemoryStorage();
  if (driver === 'local') return createLocalStorage(options.rootDir || (options.env || process.env).OBJECT_STORAGE_DIR);
  if (driver === 's3') return createS3Storage(options.env || process.env);
  throw new Error(`Unknown object storage driver: ${driver}`);
}

module.exports = {
  encryptSecret,
  decryptSecret,
  resolveDriver,
  createMemoryStorage,
  createLocalStorage,
  createS3Storage,
  createStorage,
};
