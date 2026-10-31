import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../api';

const STATE_LABEL = {
  queued: 'Waiting to open',
  opened: 'Posting opened. You have not marked it submitted.',
  submitted: 'You marked this as submitted by you.',
  skipped: 'Skipped. Nothing was marked submitted.',
};

export default function ApplyQueue() {
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  function load() {
    return api('/api/apply-queue').then(setQueue);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function continueWith(path, opportunityId) {
    const nextKnown = queue && queue.items.find((item) => item.state === 'queued' && item.opportunityId !== opportunityId);
    if (nextKnown && nextKnown.url) window.open(nextKnown.url, '_blank', 'noopener,noreferrer');
    try {
      const body = await api(path, { method: 'POST', body: '{}' });
      setError('');
      if (body.next && body.next.url) {
        await api(`/api/apply-queue/${body.next.opportunityId}/open`, { method: 'POST', body: '{}' });
        setNote('The next employer posting is open. Attach your saved resume there. This app does not submit the form.');
      } else {
        setNote(path.endsWith('/submitted')
          ? 'You marked this as submitted by you. Nothing was sent from this app.'
          : 'Skipped. Nothing was marked submitted.');
      }
      setQueue(await api('/api/apply-queue'));
    } catch (err) {
      setError(err.message);
    }
  }

  async function openCurrent(opportunityId) {
    const currentItem = queue && queue.items.find((item) => item.opportunityId === opportunityId);
    if (currentItem && currentItem.url) window.open(currentItem.url, '_blank', 'noopener,noreferrer');
    try {
      const body = await api(`/api/apply-queue/${opportunityId}/open`, { method: 'POST', body: '{}' });
      setError('');
      setQueue(body.queue);
      setNote(body.note);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!queue) return <p className="text-sm text-slate-600">Loading apply queue…</p>;

  const current = queue.items.find((item) => item.state === 'opened') || queue.items.find((item) => item.state === 'queued');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Apply queue</h2>
        <p className="text-sm text-slate-600">
          Open one official posting at a time. Attach the resume saved on this account and send the form on the employer site.
          This app does not fill or submit it. After you submit there, mark it here and the next posting opens.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          {queue.resume ? `Resume on file: ${queue.resume.fileName}.` : 'Upload a resume on the Resume tab before opening a posting.'}
        </p>
      </div>
      {error && <p className="text-sm text-amber-800">{error}</p>}
      {note && <p className="text-sm text-slate-700">{note}</p>}
      {current && (
        <section className="panel p-5">
          <p className="text-sm text-slate-600">{current.employerName}</p>
          <h3 className="text-xl font-semibold">{current.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{STATE_LABEL[current.state]}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn" type="button" onClick={() => openCurrent(current.opportunityId)}>
              {current.state === 'opened' ? 'Open posting again' : 'Open this posting'}
            </button>
            {current.url && (
              <a className="btn-quiet" href={current.url} target="_blank" rel="noreferrer">
                Open original posting <ExternalLink size={14} />
              </a>
            )}
            {current.state === 'opened' && (
              <button className="btn-quiet" type="button" onClick={() => continueWith(`/api/apply-queue/${current.opportunityId}/submitted`, current.opportunityId)}>
                I submitted this on the employer site
              </button>
            )}
            {current.state !== 'submitted' && (
              <button className="btn-quiet" type="button" onClick={() => continueWith(`/api/apply-queue/${current.opportunityId}/skip`, current.opportunityId)}>
                Skip
              </button>
            )}
          </div>
        </section>
      )}
      {queue.items.length === 0 && <p className="panel p-5 text-sm text-slate-600">No postings in the queue. Add one from the opportunities list.</p>}
      {queue.items.length > 0 && (
        <ul className="panel divide-y divide-slate-100">
          {queue.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-slate-600">{item.employerName} · {STATE_LABEL[item.state]}</p>
              </div>
              {item.state !== 'submitted' && (
                <button className="btn-quiet" type="button" onClick={() => api(`/api/apply-queue/${item.opportunityId}`, { method: 'DELETE' }).then(setQueue).catch((err) => setError(err.message))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
