import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../api';
import { EMPLOYMENT, EMPLOYER_TYPES, ENGAGEMENT, HIRING_RELATIONSHIPS, MODULES, PLATFORMS, ROLES, applicationOpenLabel, employerTypeLabel, employmentLabel, hiringRelationshipLabel, published, workplaceLabel, when } from '../labels';

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
};

export default function Feed({ filters, setFilters, onOpen }) {
  const [data, setData] = useState({ total: 0, opportunities: [] });
  const [collection, setCollection] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchName, setSearchName] = useState('');

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
    await api('/api/saved-searches', { method: 'POST', body: JSON.stringify({ name: searchName, filters }) });
    setSearchName('');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Opportunities</h2>
          <p className="text-sm text-slate-600">{data.coverage ? data.coverage.label : 'Listings found across monitored sources'}: {data.total}. This is not the whole Oracle HCM job market. Demo listings stay hidden.</p>
          {filters.scope === 'usa' && <p className="text-sm text-slate-600">United States scope is on. A remote job stays when its geographic eligibility is unknown.</p>}
          {collection && collection.refreshing && <p className="text-sm text-cyan-700">Reading public career boards and their published requirements.</p>}
        </div>
        <div className="flex gap-2">
          <button className="btn" type="button" onClick={refreshPublic}>Refresh public boards</button>
          <button className="btn-quiet" type="button" onClick={loadDemo}>Load labeled demo data</button>
        </div>
      </div>
      <div className="panel grid gap-3 p-4 md:grid-cols-4">
        <label className="text-sm md:col-span-2">Search
          <input className="field" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Title, employer, or wording" />
        </label>
        <Select label="Platform" value={filters.platform} onChange={(platform) => setFilters({ ...filters, platform })} options={PLATFORMS} />
        <Select label="Employment" value={filters.employmentType} onChange={(employmentType) => setFilters({ ...filters, employmentType })} options={EMPLOYMENT} />
        <Select label="Engagement" value={filters.engagement || ''} onChange={(engagement) => setFilters({ ...filters, engagement })} options={ENGAGEMENT} />
        <Select label="Geography" value={filters.scope || ''} onChange={(scope) => setFilters({ ...filters, scope })} options={[['', 'Any geography'], ['usa', 'United States']]} />
        <Select label="Employer type" value={filters.employerType || ''} onChange={(employerType) => setFilters({ ...filters, employerType })} options={EMPLOYER_TYPES} />
        <Select label="Hiring relationship" value={filters.hiringRelationship || ''} onChange={(hiringRelationship) => setFilters({ ...filters, hiringRelationship })} options={HIRING_RELATIONSHIPS} />
        <Select label="Role" value={filters.roleCategory} onChange={(roleCategory) => setFilters({ ...filters, roleCategory })} options={ROLES} />
        <label className="text-sm">Module
          <select className="field" value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })}>
            {MODULES.map((mod) => <option key={mod || 'any'} value={mod}>{mod || 'Any module'}</option>)}
          </select>
        </label>
        <label className="text-sm">Workplace
          <select className="field" value={filters.workplace} onChange={(event) => setFilters({ ...filters, workplace: event.target.value })}>
            <option value="">Any workplace</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="on_site">On-site</option>
            <option value="unknown">Not stated</option>
          </select>
        </label>
        <label className="text-sm">Location
          <input className="field" value={filters.location} onChange={(event) => setFilters({ ...filters, location: event.target.value })} />
        </label>
        <label className="text-sm">Listing status
          <select className="field" value={filters.listingStatus} onChange={(event) => setFilters({ ...filters, listingStatus: event.target.value })}>
            <option value="active">Active</option>
            <option value="removed">Removed</option>
            <option value="expired">Expired</option>
            <option value="unknown">Unknown</option>
            <option value="">Any status</option>
          </select>
        </label>
        <label className="text-sm">Who is hiring
          <select className="field" value={filters.hiringContext || ''} onChange={(event) => setFilters({ ...filters, hiringContext: event.target.value })}>
            <option value="">Direct clients and consulting firms</option>
            <option value="direct_client">Direct clients</option>
            <option value="consulting_firm">Consulting firms</option>
          </select>
        </label>
        <label className="text-sm">Employers
          <select className="field" value={filters.big5 || ''} onChange={(event) => setFilters({ ...filters, big5: event.target.value })}>
            <option value="">All collected employers</option>
            <option value="true">Deloitte, PwC, EY, KPMG, Accenture</option>
          </select>
        </label>
        <label className="text-sm">Demo data
          <select className="field" value={filters.synthetic} onChange={(event) => setFilters({ ...filters, synthetic: event.target.value })}>
            <option value="">Include demo data</option>
            <option value="false">Hide demo data</option>
            <option value="true">Demo data only</option>
          </select>
        </label>
        <div className="flex items-end gap-2 md:col-span-2">
          <input className="field" value={searchName} onChange={(event) => setSearchName(event.target.value)} placeholder="Save this search as…" />
          <button className="btn" onClick={saveSearch}>Save</button>
          <button className="btn-quiet" onClick={() => setFilters(EMPTY)}>Reset</button>
        </div>
      </div>
      {data.coverage && (
        <div className="grid gap-2 text-sm text-slate-700 md:grid-cols-4">
          <p className="panel p-3">Employers configured: {data.coverage.configured}</p>
          <p className="panel p-3">Sources checked: {data.coverage.checked}</p>
          <p className="panel p-3">Failing or unsupported: {data.coverage.failing + data.coverage.unsupported}</p>
          <p className="panel p-3">Verified active: {data.coverage.verifiedActive}</p>
          <p className="panel p-3">Unverified: {data.coverage.unverified}</p>
          <p className="panel p-3">Unknown posting date: {data.coverage.unknownPostedDate}</p>
          <p className="panel p-3 md:col-span-2">Last collection: {when(data.coverage.lastCollectionAt)}</p>
        </div>
      )}
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
              {['Title', 'Employer', 'Employer type', 'Hiring relationship', 'Oracle modules', 'Employment type', 'Location', 'Work arrangement', 'Published date', 'First discovered', 'Last verified', 'Status', 'Original link'].map((heading) => (
                <th key={heading} className="px-3 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.opportunities.map((opportunity) => (
              <tr key={opportunity.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-2">
                  {opportunity.canonicalUrl ? (
                    <a className="font-medium text-cyan-800" href={opportunity.canonicalUrl} target="_blank" rel="noreferrer">{opportunity.title}</a>
                  ) : (
                    <button className="text-left font-medium" onClick={() => onOpen(opportunity.id)}>{opportunity.title}</button>
                  )}
                  <button className="mt-1 block text-xs text-slate-500" onClick={() => onOpen(opportunity.id)}>Details</button>
                  {opportunity.isNew && <span className="text-xs text-cyan-800">New</span>}
                </td>
                <td className="px-3 py-2">{opportunity.employerName}</td>
                <td className="px-3 py-2">{employerTypeLabel(opportunity.employerType)}</td>
                <td className="px-3 py-2">{hiringRelationshipLabel(opportunity.hiringRelationship)}</td>
                <td className="px-3 py-2">{(opportunity.oracle && opportunity.oracle.modules || []).join(', ') || 'Not tagged'}</td>
                <td className="px-3 py-2">{employmentLabel(opportunity.employmentType)}</td>
                <td className="px-3 py-2">{opportunity.locations.map((location) => location.label).join(', ') || 'Not published'}</td>
                <td className="px-3 py-2">{workplaceLabel(opportunity.workplace)}</td>
                <td className="px-3 py-2">{published(opportunity)}</td>
                <td className="px-3 py-2">{when(opportunity.firstSeenAt)}</td>
                <td className="px-3 py-2">{when(opportunity.lastCheckedAt)}</td>
                <td className="px-3 py-2">{opportunity.listingStatus} · {applicationOpenLabel(opportunity.applicationOpen)}</td>
                <td className="px-3 py-2">
                  {opportunity.canonicalUrl ? (
                    <a className="inline-flex items-center gap-1 font-semibold text-cyan-800" href={opportunity.canonicalUrl} target="_blank" rel="noreferrer">
                      Open <ExternalLink size={14} />
                    </a>
                  ) : 'Not published'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
