import { useEffect, useState } from 'react';
import { api } from '../api';
import { when } from '../labels';

export default function Health() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/collection/health').then(setHealth).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-amber-800">{error}</p>;
  if (!health) return <p className="text-sm text-slate-600">Loading collection health…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Collection health</h2>
        <p className="text-sm text-slate-600">A failed or partial refresh does not mark listings removed. Removal happens only after a complete snapshot leaves a job out.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {Object.entries(health.counts).map(([status, count]) => (
          <div key={status} className="panel p-4">
            <p className="text-xs uppercase text-slate-500">{status}</p>
            <p className="text-2xl font-semibold">{count}</p>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {health.runs.length === 0 && <p className="text-sm text-slate-500">No collection runs yet.</p>}
        {health.runs.map((run) => (
          <article key={run.id} className="panel p-4 text-sm">
            <p className="font-medium text-slate-900">{run.status} · {when(run.startedAt)}</p>
            <p className="text-slate-600">Fetched {run.fetched}, created {run.created}, updated {run.updated}, removed {run.removed}, pages {run.pages}.</p>
            {run.completeness && <p className="text-slate-500">Completeness: {run.completeness.verified ? 'verified' : 'not verified'} ({run.completeness.kind}).</p>}
            {run.error && <p className="text-amber-800">{run.error}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
