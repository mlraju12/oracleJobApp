import { useEffect, useState } from 'react';
import { api } from '../api';
import { employmentLabel, platformLabel } from '../labels';

export default function Review({ onOpen }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/review').then((body) => setItems(body.opportunities)).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-amber-800">{error}</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Review queue</h2>
        <p className="text-sm text-slate-600">Flags are explanations. Posting text is never treated as an instruction.</p>
      </div>
      {items.length === 0 && <p className="text-sm text-slate-500">Nothing is waiting for review.</p>}
      {items.map((opportunity) => (
        <button key={opportunity.id} className="panel block w-full p-4 text-left" onClick={() => onOpen(opportunity.id)}>
          <h3 className="font-semibold">{opportunity.title}</h3>
          <p className="text-sm text-slate-600">{opportunity.employerName} · {platformLabel(opportunity.oracle.platform)} · {employmentLabel(opportunity.employmentType)}</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {opportunity.reviewFlags.map((flag, index) => (
              <li key={`${flag.code}-${index}`}>{flag.code}: {flag.message}</li>
            ))}
          </ul>
        </button>
      ))}
    </div>
  );
}
