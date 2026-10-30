import { useEffect, useState } from 'react';
import { api } from '../api';
import { employmentLabel } from '../labels';

export default function Saved({ onOpen, onApplySearch }) {
  const [saved, setSaved] = useState([]);
  const [searches, setSearches] = useState([]);
  const [error, setError] = useState('');

  function load() {
    return Promise.all([api('/api/saved'), api('/api/saved-searches')]).then(([savedBody, searchBody]) => {
      setSaved(savedBody.saved);
      setSearches(searchBody.searches);
    });
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function remove(id) {
    await api(`/api/saved/${id}`, { method: 'DELETE' });
    await load();
  }

  async function removeSearch(id) {
    await api(`/api/saved-searches/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold">Saved opportunities</h2>
        <p className="text-sm text-slate-600">Personal status stays in your account. Employers are not contacted.</p>
        {error && <p className="mt-2 text-sm text-amber-800">{error}</p>}
        <div className="mt-3 space-y-2">
          {saved.length === 0 && <p className="text-sm text-slate-500">Nothing saved yet.</p>}
          {saved.map((opportunity) => (
            <article key={opportunity.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <button className="text-left" onClick={() => onOpen(opportunity.id)}>
                <h3 className="font-semibold">{opportunity.title}</h3>
                <p className="text-sm text-slate-600">{opportunity.employerName} · {employmentLabel(opportunity.employmentType)} · {opportunity.personalStatus.replaceAll('_', ' ')}</p>
              </button>
              <button className="btn-quiet" onClick={() => remove(opportunity.id)}>Remove</button>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Saved searches</h2>
        <div className="mt-3 space-y-2">
          {searches.length === 0 && <p className="text-sm text-slate-500">No saved searches yet.</p>}
          {searches.map((search) => (
            <article key={search.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h3 className="font-semibold">{search.name}</h3>
                <p className="text-sm text-slate-600">{Object.entries(search.filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'No filters'}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn" onClick={() => onApplySearch(search.filters)}>Run</button>
                <button className="btn-quiet" onClick={() => removeSearch(search.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
