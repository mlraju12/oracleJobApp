import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../api';
import { EMPLOYMENT, EMPLOYER_TYPES, ENGAGEMENT, HIRING_RELATIONSHIPS, MODULES, PLATFORMS, ROLES, applicationOpenLabel, employerTypeLabel, employmentLabel, hiringRelationshipLabel, published, relationshipLabel, scheduleLabel, workplaceLabel, when, whenZone } from '../labels';

const EMPTY = {
  q: '',
  employmentType: '',
  workplace: '',
  module: '',
  roleCategory: '',
  platform: 'oracle_cloud_hcm,mixed',
  listingStatus: 'active',
  location: '',
  synthetic: 'false',
  big5: '',
  hiringContext: '',
  scope: '',
  engagement: '',
  employerType: '',
  hiringRelationship: '',
  relationship: '',
  schedule: '',
  postedAfter: '',
  postedBefore: '',
  discoveredAfter: '',
  discoveredBefore: '',
  experienceMin: '',
  experienceMax: '',
  excludeSource: '',
  directEndClient: '',
};

export default function Feed({ filters, setFilters, onOpen }) {
  const [data, setData] = useState({ total: 0, opportunities: [] });
  const [collection, setCollection] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [draft, setDraft] = useState(filters);
  const [queuedIds, setQueuedIds] = useState({});

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  function runSearch(event) {
    if (event) event.preventDefault();
    setFilters({ ...draft });
    document.getElementById('opportunity-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setSourceIncluded(id, included) {
    const excluded = new Set(String(draft.excludeSource || '').split(',').filter(Boolean));
    if (included) excluded.delete(id);
    else excluded.add(id);
    setDraft({ ...draft, excludeSource: [...excluded].join(',') });
  }

  useEffect(() => {
    let stop = false;
    let timer;
    let polls = 0;
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    let marked = false;
    function run() {
      setLoading(true);
      api(`/api/opportunities?${params.toString()}`)
        .then((body) => {
          if (stop) return;
          setData(body);
          setCollection(body.collection || null);
          setError('');
          if (!marked) {
            marked = true;
            api('/api/feed/seen', { method: 'POST', body: '{}' }).catch(() => {});
          }
          if (body.collection && body.collection.refreshing && polls < 45) {
            polls += 1;
            timer = setTimeout(run, 4000);
          }
        })
        .catch((err) => {
          if (!stop) setError(err.message);
        })
        .finally(() => {
          if (!stop) setLoading(false);
        });
    }
    run();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [filters]);

  async function refreshPublic() {
    setError('');
    try {
      await api('/api/catalog/refresh', { method: 'POST', body: '{}' });
      setFilters({ ...filters });
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadDemo() {
    setError('');
    try {
      await api('/api/demo/load', { method: 'POST', body: '{}' });
      setFilters({ ...filters });
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSearch() {
    if (!searchName.trim()) return;
    await api('/api/saved-searches', { method: 'POST', body: JSON.stringify({ name: searchName, filters: draft }) });
    setSearchName('');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Opportunities</h2>
          <p className="text-sm text-slate-600">{data.coverage ? data.coverage.label : 'Listings found across monitored sources'}: {data.total} in this view. This is not the whole Oracle HCM job market. Demo listings stay hidden.</p>
          {filters.scope === 'usa' && <p className="text-sm text-slate-600">United States scope is on. A remote job stays when its geographic eligibility is unknown. A named non-US place is left out.</p>}
          {filters.scope === 'other' && <p className="text-sm text-slate-600">Other countries shows listings that state a non-US place or remote restriction.</p>}
          {filters.directEndClient === 'true' && <p className="text-sm text-slate-600">Direct end-client keeps listings where the employer is an end user hiring its own team.</p>}
          {(filters.experienceMin || filters.experienceMax) && <p className="text-sm text-slate-600">Experience years keeps listings whose posting states a year count in this range. A seniority word such as Senior is not a year count. Listings that do not state years are left out.</p>}
          {collection && collection.refreshing && <p className="text-sm text-cyan-700">Reading public career boards and their published requirements.</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn" type="button" onClick={refreshPublic}>Refresh public boards</button>
          <button className="btn-quiet" type="button" onClick={loadDemo}>Load labeled demo data</button>
        </div>
      </div>
      <form className="panel grid gap-3 p-4 md:grid-cols-4" onSubmit={runSearch}>
        <label className="text-sm md:col-span-2">Search
          <input className="field" value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="Title, employer, or wording" />
        </label>
        <Select label="Platform" value={draft.platform} onChange={(platform) => setDraft({ ...draft, platform })} options={PLATFORMS} />
        <Select label="Employment" value={draft.employmentType} onChange={(employmentType) => setDraft({ ...draft, employmentType })} options={EMPLOYMENT} />
        <Select label="Engagement" value={draft.engagement || ''} onChange={(engagement) => setDraft({ ...draft, engagement })} options={ENGAGEMENT} />
        <Select label="Relationship" value={draft.relationship || ''} onChange={(relationship) => setDraft({ ...draft, relationship })} options={[['', 'Any relationship'], ['employee', 'Employee'], ['contractor', 'Contractor'], ['temporary', 'Temporary'], ['unknown', 'Not stated']]} />
        <Select label="Schedule" value={draft.schedule || ''} onChange={(schedule) => setDraft({ ...draft, schedule })} options={[['', 'Any schedule'], ['full_time', 'Full-time'], ['part_time', 'Part-time'], ['variable', 'Variable hours'], ['unknown', 'Not stated']]} />
        <Select label="Geography" value={draft.scope || ''} onChange={(scope) => setDraft({ ...draft, scope })} options={[['', 'Any geography'], ['usa', 'United States'], ['other', 'Other countries']]} />
        <Select label="Employer type" value={draft.employerType || ''} onChange={(employerType) => setDraft({ ...draft, employerType })} options={EMPLOYER_TYPES} />
        <Select label="Hiring relationship" value={draft.hiringRelationship || ''} onChange={(hiringRelationship) => setDraft({ ...draft, hiringRelationship })} options={HIRING_RELATIONSHIPS} />
        <Select label="Role" value={draft.roleCategory} onChange={(roleCategory) => setDraft({ ...draft, roleCategory })} options={ROLES} />
        <label className="text-sm">Module
          <select className="field" value={draft.module} onChange={(event) => setDraft({ ...draft, module: event.target.value })}>
            {MODULES.map((mod) => <option key={mod || 'any'} value={mod}>{mod || 'Any module'}</option>)}
          </select>
        </label>
        <label className="text-sm">Workplace
          <select className="field" value={draft.workplace} onChange={(event) => setDraft({ ...draft, workplace: event.target.value })}>
            <option value="">Any workplace</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="on_site">On-site</option>
            <option value="unknown">Not stated</option>
          </select>
        </label>
        <label className="text-sm">Location
          <input className="field" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
        </label>
        <label className="text-sm">Experience from
          <input className="field" type="number" min="0" max="60" inputMode="numeric" placeholder="Years stated" value={draft.experienceMin || ''} onChange={(event) => setDraft({ ...draft, experienceMin: event.target.value })} />
        </label>
        <label className="text-sm">Experience through
          <input className="field" type="number" min="0" max="60" inputMode="numeric" placeholder="Years stated" value={draft.experienceMax || ''} onChange={(event) => setDraft({ ...draft, experienceMax: event.target.value })} />
        </label>
        <label className="text-sm">Posted from
          <input className="field" type="date" value={draft.postedAfter || ''} onChange={(event) => setDraft({ ...draft, postedAfter: event.target.value })} />
        </label>
        <label className="text-sm">Posted through
          <input className="field" type="date" value={draft.postedBefore || ''} onChange={(event) => setDraft({ ...draft, postedBefore: event.target.value })} />
        </label>
        <label className="text-sm">First discovered from
          <input className="field" type="date" value={draft.discoveredAfter || ''} onChange={(event) => setDraft({ ...draft, discoveredAfter: event.target.value })} />
        </label>
        <label className="text-sm">First discovered through
          <input className="field" type="date" value={draft.discoveredBefore || ''} onChange={(event) => setDraft({ ...draft, discoveredBefore: event.target.value })} />
        </label>
        <label className="text-sm">Listing status
          <select className="field" value={draft.listingStatus} onChange={(event) => setDraft({ ...draft, listingStatus: event.target.value })}>
            <option value="active">Active</option>
            <option value="removed">Removed</option>
            <option value="expired">Expired</option>
            <option value="unknown">Unknown</option>
            <option value="">Any status</option>
          </select>
        </label>
        <label className="text-sm">Who is hiring
          <select className="field" value={draft.hiringContext || ''} onChange={(event) => setDraft({ ...draft, hiringContext: event.target.value })}>
            <option value="">Direct clients and consulting firms</option>
            <option value="direct_client">Direct clients</option>
            <option value="consulting_firm">Consulting firms</option>
          </select>
        </label>
        <label className="flex items-end gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            className="mb-2"
            checked={draft.directEndClient === 'true'}
            onChange={(event) => setDraft({ ...draft, directEndClient: event.target.checked ? 'true' : '' })}
          />
          <span>Direct end-client<span className="block text-xs text-slate-500">End-user employer hiring its own team. A Dice Direct Hire label is not enough.</span></span>
        </label>
        <label className="text-sm">Employers
          <select className="field" value={draft.big5 || ''} onChange={(event) => setDraft({ ...draft, big5: event.target.value })}>
            <option value="">All collected employers</option>
            <option value="true">Deloitte, PwC, EY, KPMG, Accenture</option>
          </select>
        </label>
        <label className="text-sm">Demo data
          <select className="field" value={draft.synthetic} onChange={(event) => setDraft({ ...draft, synthetic: event.target.value })}>
            <option value="">Include demo data</option>
            <option value="false">Hide demo data</option>
            <option value="true">Demo data only</option>
          </select>
        </label>
        <fieldset className="md:col-span-4">
          <legend className="text-sm">Pulled from</legend>
          <p className="mt-1 text-xs text-slate-500">Uncheck a source to leave its listings out, then click Search. Uncheck Dice to hide jobs pulled from Dice.</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {(data.sources || []).map((source) => (
              <label key={source.id} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!String(draft.excludeSource || '').split(',').includes(source.id)}
                  onChange={(event) => setSourceIncluded(source.id, event.target.checked)}
                />
                {source.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-end gap-2 md:col-span-2">
          <button className="btn" type="submit">Search</button>
          <button className="btn-quiet" type="button" onClick={() => { setDraft(EMPTY); setFilters(EMPTY); }}>Reset</button>
        </div>
        <div className="flex items-end gap-2 md:col-span-2">
          <input className="field" value={searchName} onChange={(event) => setSearchName(event.target.value)} placeholder="Save this search as…" />
          <button className="btn-quiet" type="button" onClick={saveSearch}>Save</button>
        </div>
      </form>
      {data.coverage && (
        <div className="panel space-y-3 p-4 text-sm text-slate-700">
          <p>{data.coverage.activeMeaning}</p>
          <p>{data.coverage.equation}</p>
          <p>The {data.coverage.boards} configured sources are employer career boards and public searches. They use {data.coverage.adapters} adapters. That is monitored-source coverage, not the whole job market.</p>
          <div className="grid gap-2 md:grid-cols-4">
            <p className="rounded-lg border border-slate-200 bg-white p-3">Oracle Cloud HCM: {data.coverage.oracleCloudHcm}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">Mixed Cloud with EBS or PeopleSoft: {data.coverage.mixed}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">End-user employers: {data.coverage.endUserEmployers}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">Consulting employers: {data.coverage.consultingEmployers}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">Full-time: {data.coverage.schedule && data.coverage.schedule.full_time}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">Part-time: {data.coverage.schedule && data.coverage.schedule.part_time}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">Contract relationship: {data.coverage.relationship && data.coverage.relationship.contractor}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">Schedule not stated: {data.coverage.schedule && data.coverage.schedule.unknown}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">United States scope: {data.coverage.geography && data.coverage.geography.usa}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">Other countries: {data.coverage.geography && data.coverage.geography.other}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">Boards checked: {data.coverage.checked}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3">Unsupported: {data.coverage.unsupported}. Failing: {data.coverage.failing}</p>
            <p className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">Last successful collection: {whenZone(data.coverage.lastCollectionAt)}</p>
          </div>
        </div>
      )}
      <div id="opportunity-results" className="space-y-4">
      {error && <p className="text-sm text-amber-800">{error}</p>}
      {loading && <p className="text-sm text-slate-600">Loading…</p>}
      {!loading && data.opportunities.length === 0 && (
        <div className="panel p-6 text-sm text-slate-600">
          {collection && collection.refreshing
            ? 'Public boards are still being read. Listings appear after a source job list includes them.'
            : 'No listings found across the monitored sources yet.'}
        </div>
      )}
      <div className="panel overflow-x-auto">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
            <tr>
              {['Title', 'Employer', 'Employer type', 'Hiring relationship', 'Oracle modules', 'Relationship and schedule', 'Location', 'Work arrangement', 'Published date', 'First discovered', 'Last verified', 'Status', 'Original link'].map((heading) => (
                <th key={heading} className={`px-3 py-2 font-medium ${heading === 'Title' ? 'sticky left-0 z-10 bg-white' : ''}`}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.opportunities.map((opportunity) => (
              <tr key={opportunity.id} className="border-b border-slate-100 align-top">
                <td className="sticky left-0 z-10 bg-white px-3 py-2">
                  <button className="text-left font-medium text-slate-900" onClick={() => onOpen(opportunity.id)}>{opportunity.title}</button>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <button className="text-xs text-slate-500" onClick={() => onOpen(opportunity.id)}>Details</button>
                    {opportunity.canonicalUrl && (
                      <a className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-800" href={opportunity.canonicalUrl} target="_blank" rel="noreferrer">
                        Open original posting <ExternalLink size={12} />
                      </a>
                    )}
                    {opportunity.canonicalUrl && (
                      <button
                        className="text-xs font-semibold text-cyan-800"
                        type="button"
                        onClick={() => api('/api/apply-queue', { method: 'POST', body: JSON.stringify({ opportunityId: opportunity.id }) })
                          .then(() => setQueuedIds((current) => ({ ...current, [opportunity.id]: true })))
                          .catch((err) => setError(err.message))}
                      >
                        {queuedIds[opportunity.id] ? 'In apply queue' : 'Add to apply queue'}
                      </button>
                    )}
                    {opportunity.isNew && <span className="text-xs text-cyan-800">New</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div>{opportunity.employerName}</div>
                  <div className="text-xs text-slate-500">{opportunity.sourceName || 'Source name not stored'}{opportunity.adapterType ? ` · ${opportunity.adapterType}` : ''}</div>
                </td>
                <td className="px-3 py-2">{employerTypeLabel(opportunity.employerType)}</td>
                <td className="px-3 py-2">{hiringRelationshipLabel(opportunity.hiringRelationship)}</td>
                <td className="px-3 py-2">{(opportunity.oracle && opportunity.oracle.modules || []).join(', ') || 'Not tagged'}</td>
                <td className="px-3 py-2">{relationshipLabel(opportunity.employmentRelationship)} · {scheduleLabel(opportunity.workSchedule)}</td>
                <td className="px-3 py-2">{opportunity.locations.map((location) => location.label).join(', ') || 'Not published'}</td>
                <td className="px-3 py-2">{workplaceLabel(opportunity.workplace)}</td>
                <td className="px-3 py-2">{published(opportunity)}</td>
                <td className="px-3 py-2">{when(opportunity.firstSeenAt)}</td>
                <td className="px-3 py-2">{when(opportunity.lastCheckedAt)}</td>
                <td className="px-3 py-2">
                  <div>{opportunity.listingStatus} · {applicationOpenLabel(opportunity.applicationOpen)}</div>
                  <div className="text-xs text-slate-500">Verified {when(opportunity.lastVerifiedAt || opportunity.lastCheckedAt)}</div>
                  {opportunity.listingStatusEvidence && opportunity.listingStatusEvidence.note && (
                    <div className="text-xs text-slate-500">{opportunity.listingStatusEvidence.note}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {opportunity.canonicalUrl ? (
                    <a className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-cyan-800" href={opportunity.canonicalUrl} target="_blank" rel="noreferrer">
                      Open original posting <ExternalLink size={14} />
                    </a>
                  ) : 'Not published'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="text-sm">{label}
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([id, text]) => <option key={id || text} value={id}>{text}</option>)}
      </select>
    </label>
  );
}
