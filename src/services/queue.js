const fs = require('fs');
const path = require('path');

function readState(file) {
  if (!file || !fs.existsSync(file)) return { jobs: {} };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { jobs: {} };
  }
}

function createFileQueue(file) {
  const target = path.resolve(file);
  let state = readState(target);
  let processor = null;
  let stopped = false;

  function persist() {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state));
    fs.renameSync(temporary, target);
  }

  async function run(job) {
    if (stopped || !processor || job.status === 'cancelled') return;
    job.status = 'active';
    job.attemptsMade += 1;
    persist();
    try {
      job.result = await processor({ id: job.id, name: job.name, data: job.data, attemptsMade: job.attemptsMade });
      job.status = 'completed';
      job.failedReason = '';
      persist();
    } catch (error) {
      job.failedReason = error.message || 'failed';
      const attempts = job.opts.attempts || 3;
      if (error.stopWorker) {
        job.status = 'queued';
        stopped = true;
        persist();
        return;
      }
      if (!error.retryable || job.attemptsMade >= attempts) {
        job.status = 'failed';
        persist();
        return;
      }
      job.status = 'queued';
      persist();
      if (!stopped) await run(job);
    }
  }

  return {
    mode: 'file',
    async add(name, data, opts = {}) {
      const id = String(opts.jobId || `${name}-${Date.now()}`);
      if (state.jobs[id] && ['queued', 'active'].includes(state.jobs[id].status)) return state.jobs[id];
      state.jobs[id] = {
        id,
        name,
        data,
        opts: { attempts: opts.attempts || 3 },
        status: 'queued',
        attemptsMade: state.jobs[id] ? state.jobs[id].attemptsMade : 0,
        failedReason: '',
        result: null,
      };
      persist();
      return state.jobs[id];
    },
    getJob(id) {
      return state.jobs[id] || null;
    },
    setProcessor(fn) {
      processor = fn;
      stopped = false;
    },
    async drain() {
      const pending = Object.values(state.jobs).filter((job) => job.status === 'queued');
      for (const job of pending) {
        if (stopped) break;
        await run(job);
      }
    },
    async close() {
      stopped = true;
      persist();
    },
  };
}

function redisUrl(env = process.env) {
  return env.REDIS_URL || env.REDIS_TLS_URL || '';
}

function createBullQueue(options = {}) {
  const IORedis = require('ioredis');
  const { Queue, Worker } = require('bullmq');
  const url = options.url || redisUrl(options.env || process.env);
  if (!url) throw new Error('REDIS_URL is required for the worker queue.');
  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: url.startsWith('rediss://') ? { rejectUnauthorized: (options.env || process.env).REDIS_TLS_REJECT_UNAUTHORIZED === 'true' } : undefined,
  });
  const queue = new Queue('oracle-hcm-opportunities', { connection });
  let worker = null;
  return {
    mode: 'redis',
    async add(name, data, opts = {}) {
      if (opts.jobId) {
        const existing = await queue.getJob(opts.jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'completed' || state === 'failed') await existing.remove();
          else return existing;
        }
      }
      return queue.add(name, data, {
        jobId: opts.jobId,
        attempts: opts.attempts || 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: false,
      });
    },
    setProcessor(fn, concurrency = 2) {
      worker = new Worker('oracle-hcm-opportunities', async (job) => fn(job), {
        connection: connection.duplicate(),
        concurrency,
        stalledInterval: 30000,
        maxStalledCount: 1,
      });
    },
    async close() {
      if (worker) await worker.close();
      await queue.close();
      await connection.quit();
    },
  };
}

module.exports = {
  createFileQueue,
  createBullQueue,
  redisUrl,
};
