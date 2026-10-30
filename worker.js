/**
 * Heroku worker dyno. Requires REDIS_URL and MONGODB_URI.
 * Local refresh without Redis runs inside the web process instead.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { EmployerSource } = require('./src/models');
const { refreshSource, isDue } = require('./src/services/collect');
const { createStorage } = require('./src/services/platform');
const { createBullQueue, redisUrl } = require('./src/services/queue');

if (!redisUrl()) {
  console.error('Worker requires REDIS_URL or REDIS_TLS_URL.');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('Worker requires MONGODB_URI.');
  process.exit(1);
}

const storage = createStorage();
const queue = createBullQueue();

async function handle(job) {
  if (!job || job.name !== 'source.refresh') return null;
  const source = await EmployerSource.findById(job.data && job.data.sourceId);
  if (!source) return null;
  if (String(source.tenantId) !== String(job.data.tenantId)) return null;
  return refreshSource(source, { storage });
}

async function dispatchDue() {
  const now = new Date();
  const sources = await EmployerSource.find({ status: { $in: ['enabled', 'failing'] } });
  for (const source of sources) {
    if (!isDue(source, now)) continue;
    await queue.add('source.refresh', {
      sourceId: String(source._id),
      tenantId: String(source.tenantId),
    }, { jobId: `refresh-${source._id}`, attempts: 5 });
  }
}

mongoose.connect(process.env.MONGODB_URI).then(() => {
  queue.setProcessor(handle);
  dispatchDue().catch((error) => console.error(error.message));
  setInterval(() => {
    dispatchDue().catch((error) => console.error(error.message));
  }, 60 * 1000);
  console.log('Oracle HCM Opportunities worker started');
}).catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
