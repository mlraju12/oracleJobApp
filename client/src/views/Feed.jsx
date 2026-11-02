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
  searchSource: '',
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

  function setPulledFrom(event) {
    const included = new Set([...event.target.selectedOptions].map((option) => option.value));
    const catalog = (data.sources || []).filter((source) => !source.handoff);
    const handoff = (data.sources || []).filter((source) => source.handoff);
    const excluded = catalog.map((source) => source.id).filter((id) => !included.has(id));
    const searchSource = handoff.map((source) => source.id).filter((id) => included.has(id));
    setDraft({ ...draft, excludeSource: excluded.join(','), searchSource: searchSource.join(',') });
  }

  function pulledFromValue() {
    const excluded = new Set(String(draft.excludeSource || '').split(',').filter(Boolean));
    const picked = new Set(String(draft.searchSource || '').split(',').filter(Boolean));
    return (data.sources || [])
      .filter((source) => (source.handoff ? picked.has(source.id) : !excluded.has(source.id)))
      .map((source) => source.id);
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

  async function saveSearch() {
    if (!searchName.trim()) return;
    await api('/api/saved-searches', { method: 'POST', body: JSON.stringify({ name: searchName, filters: draft }) });
    setSearchName('');
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-4xl text-ink">Opportunities</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c564e]">{data.coverage ? data.coverage.label : 'Listings found across monitored sources'}: {data.total} in this view. This is not the whole Oracle HCM job market.</p>
          {filters.scope === 'usa' && <p className="text-sm text-slate-600">United States scope is on. A remote job stays when its geographic eligibility is unknown. A named non-US place is left out.</p>}
          {filters.scope === 'other' && <p className="text-sm text-slate-600">Other countries shows listings that state a non-US place or remote restriction.</p>}
          {filters.directEndClient === 'true' && <p className="text-sm text-slate-600">Direct end-client keeps listings where the employer is an end user hiring its own team.</p>}
          {(filters.experienceMin || filters.experienceMax) && <p className="text-sm text-slate-600">Experience years keeps listings whose posting states a year count in this range. A seniority word such as Senior is not a year count. Listings that do not state years are left out.</p>}
          {collection && collection.refreshing && <p className="mt-2 text-sm font-medium text-moss">Reading public career boards and their published requirements.</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn" type="button" onClick={refreshPublic}>Refresh public boards</button>
        </div>
      </div>
      <form className="panel grid gap-3 p-5 md:grid-cols-4" onSubmit={runSearch}>
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
        <label className="text-sm md:col-span-2">Modules
          <select
            multiple
            className="field h-40"
            value={String(draft.module || '').split(',').map((item) => item.trim()).filter(Boolean)}
            onChange={(event) => {
              const selected = [...event.target.selectedOptions].map((option) => option.value);
              setDraft({ ...draft, module: selected.join(',') });
            }}
          >
            {MODULES.filter(Boolean).map((mod) => <option key={mod} value={mod}>{mod}</option>)}
          </select>
          <span className="mt-1 block text-xs text-[#6d665c]">Leave this empty for every module. A role matches if it is tagged with any selected module. Hold Ctrl and click to choose more than one, then click Search.</span>
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
        <label className="text-sm md:col-span-2">Pulled from
          <select
            multiple
            className="field h-40"
            value={pulledFromValue()}
            onChange={setPulledFrom}
          >
            {(data.sources || []).map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-[#6d665c]">Selected employer boards stay in the Oracle results. LinkedIn, Indeed, and Glassdoor are not collected. Choosing one fills that site’s public search with these filters. Hold Ctrl and click to choose more than one, then click Search.</span>
        </label>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <p className="metric"><strong>{data.coverage.oracleCloudHcm}</strong><span>Oracle Cloud HCM</span></p>
            <p className="metric"><strong>{data.coverage.mixed}</strong><span>Mixed Cloud with EBS or PeopleSoft</span></p>
            <p className="metric"><strong>{data.coverage.endUserEmployers}</strong><span>End-user employers</span></p>
            <p className="metric"><strong>{data.coverage.consultingEmployers}</strong><span>Consulting employers</span></p>
            <p className="metric"><strong>{data.coverage.schedule && data.coverage.schedule.full_time}</strong><span>Full-time</span></p>
            <p className="metric"><strong>{data.coverage.schedule && data.coverage.schedule.part_time}</strong><span>Part-time</span></p>
            <p className="metric"><strong>{data.coverage.relationship && data.coverage.relationship.contractor}</strong><span>Contract relationship</span></p>
            <p className="metric"><strong>{data.coverage.schedule && data.coverage.schedule.unknown}</strong><span>Schedule not stated</span></p>
            <p className="metric"><strong>{data.coverage.geography && data.coverage.geography.usa}</strong><span>United States scope</span></p>
            <p className="metric"><strong>{data.coverage.geography && data.coverage.geography.other}</strong><span>Other countries</span></p>
            <p className="metric"><strong>{data.coverage.checked}</strong><span>Boards checked</span></p>
            <p className="metric"><strong>{data.coverage.unsupported}</strong><span>Unsupported. Failing: {data.coverage.failing}</span></p>
            <p className="metric sm:col-span-2"><strong className="!text-xl">{whenZone(data.coverage.lastCollectionAt)}</strong><span>Last successful collection</span></p>
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
            : (data.externalSearches || []).length
              ? 'No listings in the Oracle sources match these filters.'
              : 'No listings found across the monitored sources yet.'}
        </div>
      )}
      {(data.externalSearches || []).map((search) => (
        <article key={search.sourceId || search.name} className="panel p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper">{search.name}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5c564e]">{search.message}</p>
          {search.url && (
            <a className="btn mt-4" href={search.url} target="_blank" rel="noreferrer">
              Open {search.name} search <ExternalLink size={14} />
            </a>
          )}
        </article>
      ))}
      <div className="space-y-3">
        {data.opportunities.map((opportunity) => (
          <article key={opportunity.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-forest font-display text-xl text-[#f7f1e6]">
                  {(opportunity.employerName || '?').trim().slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-copper">{opportunity.employerName}</p>
                  <button className="mt-1 text-left text-2xl text-ink hover:text-copper" onClick={() => onOpen(opportunity.id)}>{opportunity.title}</button>
                  <p className="mt-1 text-sm text-[#6d665c]">{opportunity.sourceName || 'Source name not stored'}{opportunity.adapterType ? ` · ${opportunity.adapterType}` : ''}</p>
                </div>
              </div>
              <div className="text-right text-sm text-[#5c564e]">
                {opportunity.isNew && <p className="mb-1 inline-flex rounded-full bg-[#f8e7c8] px-2.5 py-1 text-xs font-semibold text-[#8a4b12]">New</p>}
                <p><span className="capitalize">{opportunity.listingStatus}</span> · {applicationOpenLabel(opportunity.applicationOpen)}</p>
                <p className="text-xs text-[#6d665c]">Verified {when(opportunity.lastVerifiedAt || opportunity.lastCheckedAt)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="chip">{employerTypeLabel(opportunity.employerType)}</span>
              <span className="chip">{hiringRelationshipLabel(opportunity.hiringRelationship)}</span>
              <span className="chip">{relationshipLabel(opportunity.employmentRelationship)} · {scheduleLabel(opportunity.workSchedule)}</span>
              <span className="chip">{workplaceLabel(opportunity.workplace)}</span>
              <span className="chip">{opportunity.locations.map((location) => location.label).join(', ') || 'Location not published'}</span>
              <span className="chip">Modules: {(opportunity.oracle && opportunity.oracle.modules || []).join(', ') || 'Not tagged'}</span>
            </div>
            <dl className="mt-4 grid gap-2 text-sm text-[#5c564e] sm:grid-cols-3">
              <div><dt className="text-xs uppercase tracking-wide text-[#8a8378]">Published</dt><dd>{published(opportunity)}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-[#8a8378]">First discovered</dt><dd>{when(opportunity.firstSeenAt)}</dd></div>
              <div><dt className="text-xs uppercase tracking-wide text-[#8a8378]">Last verified</dt><dd>{when(opportunity.lastCheckedAt)}</dd></div>
            </dl>
            {opportunity.listingStatusEvidence && opportunity.listingStatusEvidence.note && (
              <p className="mt-2 text-xs text-[#6d665c]">{opportunity.listingStatusEvidence.note}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <button className="btn-quiet" type="button" onClick={() => onOpen(opportunity.id)}>Details</button>
              {opportunity.canonicalUrl ? (
                <a className="btn" href={opportunity.canonicalUrl} target="_blank" rel="noreferrer">
                  Open original posting <ExternalLink size={14} />
                </a>
              ) : <span className="text-sm text-[#6d665c]">Original link not published</span>}
              {opportunity.canonicalUrl && (
                <button
                  className="btn-quiet"
                  type="button"
                  onClick={() => api('/api/apply-queue', { method: 'POST', body: JSON.stringify({ opportunityId: opportunity.id }) })
                    .then(() => setQueuedIds((current) => ({ ...current, [opportunity.id]: true })))
                    .catch((err) => setError(err.message))}
                >
                  {queuedIds[opportunity.id] ? 'In apply queue' : 'Add to apply queue'}
                </button>
              )}
              {opportunity.publishedEmails && opportunity.publishedEmails.length > 0 && (
                <button
                  className="btn-quiet"
                  type="button"
                  onClick={() => api(`/api/opportunities/${opportunity.id}/email-draft`, { method: 'POST', body: '{}' })
                    .then((body) => {
                      const link = document.createElement('a');
                      link.href = body.mailto;
                      link.click();
                    })
                    .catch((err) => setError(err.message))}
                >
                  Open email draft
                </button>
              )}
            </div>
          </article>
        ))}
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
