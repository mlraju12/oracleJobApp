import { useEffect, useState } from 'react';
import { api } from '../api';
import { when } from '../labels';

const BLANK = {
  name: '',
  domain: '',
  careerSiteUrl: '',
  atsProvider: 'greenhouse',
  adapterType: 'greenhouse-job-board',
  ownership: 'direct_employer',
  accessMethod: 'public_api',
  accessDocumentationUrl: 'https://developers.greenhouse.io/job-board.html',
  accessNotes: '',
  termsReviewStatus: 'not_reviewed',
  termsNotes: '',
  refreshIntervalMinutes: 360,
  status: 'paused',
  adapterConfig: { boardToken: '', site: '', region: 'global', fetchDetails: false },
};

export default function Sources() {
  const [sources, setSources] = useState([]);
  const [adapters, setAdapters] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [importForm, setImportForm] = useState({ url: '', employerName: '', domain: '', ownership: 'unknown' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showManual, setShowManual] = useState(false);

  function load() {
    return Promise.all([api('/api/sources'), api('/api/adapters')]).then(([sourceBody, adapterBody]) => {
      setSources(sourceBody.sources);
      setAdapters(adapterBody.adapters);
    });
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function update(field, value) {
    setForm({ ...form, [field]: value });
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/api/sources', { method: 'POST', body: JSON.stringify(form) });
      setMessage('Source saved. Collection runs only after the source is enabled.');
      setForm(BLANK);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function refresh(id) {
    setError('');
    try {
      const body = await api(`/api/sources/${id}/refresh`, { method: 'POST', body: '{}' });
      setMessage(body.queued ? 'Refresh queued for the worker.' : `Refresh ${body.run.status}.`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function setStatus(source, status) {
    setError('');
    try {
      await api(`/api/sources/${source.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...source, status, termsReviewStatus: source.termsReviewStatus }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function importUrl(event) {
    event.preventDefault();
    setError('');
    try {
      const body = await api('/api/imports/url', { method: 'POST', body: JSON.stringify(importForm) });
      setMessage(`Imported ${body.opportunity.title}. Manual import does not close other listings.`);
      setImportForm({ url: '', employerName: '', domain: '', ownership: 'unknown' });
    } catch (err) {
      setError(err.message);
    }
  }

  function fillExample() {
    setForm({
      ...BLANK,
      name: 'Accenture Federal Services',
      domain: 'accenturefederal.com',
      careerSiteUrl: 'https://boards.greenhouse.io/accenturefederalservices',
      atsProvider: 'greenhouse',
      adapterType: 'greenhouse-job-board',
      ownership: 'direct_employer',
      accessMethod: 'public_api',
      accessDocumentationUrl: 'https://developers.greenhouse.io/job-board.html',
      accessNotes: 'Documented public Job Board API. GET published posts only.',
      termsReviewStatus: 'not_reviewed',
      termsNotes: 'Confirm the public-read terms before enabling scheduled collection.',
      status: 'paused',
      adapterConfig: { boardToken: 'accenturefederalservices', site: '', region: 'global', fetchDetails: false },
    });
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4 text-sm text-slate-700">
        <p>Each configured source is one employer career board or one public search, not one adapter. Greenhouse, Lever, public career pages, and Dice are the adapters. One Dice search lists many employers. Public boards are added automatically. Greenhouse, Lever, and Dice supply the posted date when they publish one. LinkedIn and Indeed do not offer a public job search. Applications are still completed on the employer site or on Dice.</p>
        <button className="btn-quiet mt-3" type="button" onClick={() => setShowManual((value) => !value)}>
          {showManual ? 'Hide manual source form' : 'Add a source manually'}
        </button>
      </div>
      {error && <p className="text-sm text-amber-800">{error}</p>}
      {message && <p className="text-sm text-cyan-800">{message}</p>}
      {showManual && (
      <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Add a source</h2>
        <p className="text-sm text-slate-600">Use this only for a board that is not already collected. Greenhouse and Lever stay paused until you record a public-read terms review and enable them.</p>
      </div>

      <form className="panel space-y-3 p-4" onSubmit={save}>
        <div className="flex flex-wrap gap-2">
          <button className="btn-quiet" type="button" onClick={fillExample}>Fill Accenture Federal Services example</button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Employer name" value={form.name} onChange={(value) => update('name', value)} />
          <Field label="Official domain" value={form.domain} onChange={(value) => update('domain', value)} />
          <Field label="Career site URL" value={form.careerSiteUrl} onChange={(value) => update('careerSiteUrl', value)} />
          <label className="text-sm">Adapter
            <select className="field" value={form.adapterType} onChange={(event) => update('adapterType', event.target.value)}>
              <option value="greenhouse-job-board">Greenhouse Job Board API</option>
              <option value="lever-postings">Lever Postings API</option>
              <option value="manual">Manual URL only</option>
            </select>
          </label>
          <label className="text-sm">Ownership
            <select className="field" value={form.ownership} onChange={(event) => update('ownership', event.target.value)}>
              <option value="direct_employer">Direct employer</option>
              <option value="staffing_company">Staffing company</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="text-sm">Terms review
            <select className="field" value={form.termsReviewStatus} onChange={(event) => update('termsReviewStatus', event.target.value)}>
              <option value="not_reviewed">Not reviewed</option>
              <option value="public_read_documented">Public read documented</option>
              <option value="blocked">Blocked</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <Field label="Greenhouse board token" value={form.adapterConfig.boardToken} onChange={(value) => setForm({ ...form, adapterConfig: { ...form.adapterConfig, boardToken: value } })} />
          <Field label="Lever site" value={form.adapterConfig.site} onChange={(value) => setForm({ ...form, adapterConfig: { ...form.adapterConfig, site: value } })} />
          <label className="text-sm">Initial status
            <select className="field" value={form.status} onChange={(event) => update('status', event.target.value)}>
              <option value="paused">Paused</option>
              <option value="enabled">Enabled</option>
            </select>
          </label>
          <Field label="Refresh interval (minutes)" value={form.refreshIntervalMinutes} onChange={(value) => update('refreshIntervalMinutes', Number(value))} />
        </div>
        <label className="block text-sm">Terms notes
          <textarea className="field min-h-20" value={form.termsNotes} onChange={(event) => update('termsNotes', event.target.value)} />
        </label>
        <button className="btn" type="submit">Save source</button>
      </form>

      <form className="panel grid gap-3 p-4 md:grid-cols-2" onSubmit={importUrl}>
        <h3 className="font-semibold md:col-span-2">Manual public URL</h3>
        <Field label="Job URL" value={importForm.url} onChange={(url) => setImportForm({ ...importForm, url })} />
        <Field label="Employer name" value={importForm.employerName} onChange={(employerName) => setImportForm({ ...importForm, employerName })} />
        <Field label="Domain" value={importForm.domain} onChange={(domain) => setImportForm({ ...importForm, domain })} />
        <label className="text-sm">Ownership
          <select className="field" value={importForm.ownership} onChange={(event) => setImportForm({ ...importForm, ownership: event.target.value })}>
            <option value="unknown">Unknown</option>
            <option value="direct_employer">Direct employer</option>
            <option value="staffing_company">Staffing company</option>
          </select>
        </label>
        <button className="btn md:col-span-2" type="submit">Import URL</button>
      </form>
      </div>
      )}

      <div className="space-y-3">
        {sources.map((source) => (
          <article key={source.id} className="panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{source.name}</h3>
                <p className="text-sm text-slate-600">{source.domain} · {source.ownership.replaceAll('_', ' ')} · {source.status}{source.catalogKey ? ' · collected automatically' : ''}</p>
              </div>
              {source.synthetic && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-900">Demo data</span>}
            </div>
            <p className="mt-2 text-sm text-slate-700">{source.adapterSummary}</p>
            <p className="mt-1 text-xs text-slate-500">
              Adapter {source.adapterVerified ? 'verified against current documentation' : 'not a live verified feed'}.
              Terms: {source.termsReviewStatus.replaceAll('_', ' ')}.
              Last success: {when(source.lastSuccessfulCollectionAt)}. Last run: {source.lastRunStatus}.
              Closure: {source.closurePolicy === 'never_auto_close' ? 'never close from a scan' : 'close only after a complete scan leaves the job out'}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {source.status !== 'enabled' && !source.synthetic && <button className="btn" onClick={() => setStatus(source, 'enabled')}>Enable</button>}
              {source.status === 'enabled' && <button className="btn-quiet" onClick={() => setStatus(source, 'paused')}>Pause</button>}
              {['enabled', 'failing'].includes(source.status) && <button className="btn-quiet" onClick={() => refresh(source.id)}>Refresh now</button>}
            </div>
          </article>
        ))}
      </div>

      <section className="panel p-4 text-sm text-slate-600">
        <h3 className="font-semibold text-slate-800">Verified adapters</h3>
        <ul className="mt-2 space-y-2">
          {adapters.map((adapter) => (
            <li key={adapter.id}>
              <span className="text-slate-800">{adapter.label}</span> — {adapter.summary}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label className="text-sm">{label}
      <input className="field" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
