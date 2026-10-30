const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFileQueue } = require('../src/services/queue');

describe('worker restart and retry', () => {
  test('a crashed refresh stays queued and completes after the worker restarts', async () => {
    const file = path.join(os.tmpdir(), `ohcm-queue-${Date.now()}.json`);
    const first = createFileQueue(file);
    let runs = 0;
    first.setProcessor(async () => {
      runs += 1;
      const error = new Error('worker crashed after claim');
      error.retryable = true;
      error.stopWorker = true;
      throw error;
    });
    await first.add('source.refresh', { sourceId: 'source-1', tenantId: 'tenant-1' }, { jobId: 'refresh-source-1', attempts: 3 });
    await first.drain();
    expect(first.getJob('refresh-source-1').status).toBe('queued');
    expect(first.getJob('refresh-source-1').attemptsMade).toBe(1);
    await first.close();

    const restarted = createFileQueue(file);
    restarted.setProcessor(async (job) => {
      runs += 1;
      return { ok: true, sourceId: job.data.sourceId };
    });
    await restarted.drain();
    const job = restarted.getJob('refresh-source-1');
    expect(job.status).toBe('completed');
    expect(job.attemptsMade).toBe(2);
    expect(job.result).toEqual({ ok: true, sourceId: 'source-1' });
    expect(runs).toBe(2);
    fs.rmSync(file, { force: true });
  });
});
