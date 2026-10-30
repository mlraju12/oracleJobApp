import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../api';
import { PERSONAL, employmentLabel, hours, money, platformLabel, published, roleLabel, when, workplaceLabel } from '../labels';

export default function Detail({ id, onBack }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [personalStatus, setPersonalStatus] = useState('saved');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!id) return;
    api(`/api/opportunities/${id}`)
      .then((body) => {
        setPayload(body);
        setPersonalStatus(body.opportunity.personalStatus || 'saved');
        setNotes(body.opportunity.personalNotes || '');
      })
      .catch((err) => setError(err.message));
  }, [id]);

  if (!id) return <p className="text-sm text-slate-600">Choose an opportunity from the feed.</p>;
  if (error) return <p className="text-sm text-amber-800">{error}</p>;
  if (!payload) return <p className="text-sm text-slate-600">Loading…</p>;

  const opportunity = payload.opportunity;
  const source = payload.source;

  async function openApplication() {
    try {
      const body = await api(`/api/opportunities/${id}/apply`, { method: 'POST', body: '{}' });
      setActionError('');
      setPayload({ ...payload, application: body.application, notice: body.note });
      window.open(body.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function markSubmitted() {
    try {
      const body = await api(`/api/opportunities/${id}/apply/submitted`, { method: 'POST', body: '{}' });
      setActionError('');
      setPayload({ ...payload, application: body.application });
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function save() {
    try {
      const body = await api(`/api/opportunities/${id}/save`, {
        method: 'POST',
        body: JSON.stringify({ personalStatus, notes }),
      });
      setActionError('');
      setPayload({
        ...payload,
        notice: body.note,
        opportunity: { ...opportunity, personalStatus, personalNotes: notes },
      });
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <button className="btn-quiet" onClick={onBack}>Back to feed</button>
      {actionError && <p className="text-sm text-amber-800">{actionError}</p>}
      {opportunity.synthetic && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{opportunity.syntheticLabel}</p>
      )}
      <div className="panel p-5">
        <p className="text-sm text-slate-600">{opportunity.employerName} · {opportunity.sourceOwnership.replaceAll('_', ' ')}{opportunity.hiringContext === 'direct_client' ? ' · Direct client' : ''}{opportunity.hiringContext === 'consulting_firm' ? ' · Consulting firm' : ''}</p>
        <h2 className="mt-1 text-2xl font-semibold">{opportunity.title}</h2>
        {opportunity.oracle && opportunity.oracle.relevance && (
          <p className="mt-2 text-sm text-slate-700">Relevance {opportunity.oracle.relevance.score}. {opportunity.oracle.relevance.basis}</p>
        )}
        <p className="mt-2 text-sm text-slate-600">{opportunity.classificationEvidence}</p>
        <Classification opportunity={opportunity} onSaved={(next) => setPayload({ ...payload, opportunity: next })} />
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-1">{employmentLabel(opportunity.employmentType)}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1">{workplaceLabel(opportunity.workplace)}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1">{platformLabel(opportunity.oracle.platform)}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1">{roleLabel(opportunity.oracle.roleCategory)}</span>
          {opportunity.presenceConfidence === 'unverified' && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900">Presence unverified</span>}
        </div>
        {opportunity.canonicalUrl ? (
          <a className="mt-4 inline-flex items-center gap-2 text-sm text-cyan-700" href={opportunity.canonicalUrl} target="_blank" rel="noreferrer">
            Open original posting <ExternalLink size={16} />
          </a>
        ) : <p className="mt-4 text-sm text-slate-500">Original URL was not published.</p>}
      </div>

      <section className="panel p-5">
        <h3 className="font-semibold">Why this matches</h3>
        {opportunity.oracle.matches.length === 0 && <p className="mt-2 text-sm text-slate-600">No explainable Oracle HCM phrase was found.</p>}
        <ul className="mt-3 space-y-2 text-sm">
          {opportunity.oracle.matches.map((match, index) => (
            <li key={`${match.label}-${index}`} className="rounded-lg bg-slate-50 p-3">
              <span className="text-cyan-700">{match.label}.</span> <span className="text-slate-700">“{match.excerpt}”</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">Extraction confidence {Math.round((opportunity.extractionConfidence || 0) * 100)}%. Supporting text is quoted from the posting and is not an instruction.</p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Fact label="Employment type" value={employmentLabel(opportunity.employmentType)} />
        <Fact label="Working hours" value={hours(opportunity.workingSchedule)} unknown={opportunity.workingSchedule.status !== 'published'} />
        <Fact label="Locations" value={opportunity.locations.map((location) => location.label).join(' · ') || 'Not published'} unknown={!opportunity.locations.length} />
        <Fact label="Workplace" value={workplaceLabel(opportunity.workplace)} unknown={opportunity.workplace === 'unknown'} />
        <Fact label="Remote geography" value={opportunity.geography.status === 'stated' ? opportunity.geography.restrictions.join(' · ') : 'Not stated'} unknown={opportunity.geography.status !== 'stated'} />
        <Fact label="Compensation" value={money(opportunity.compensation)} unknown={opportunity.compensation.status !== 'published'} />
        <Fact label="Currency" value={opportunity.compensation.currency || 'Not stated'} unknown={!opportunity.compensation.currency} />
        <Fact label="Pay period" value={opportunity.compensation.payPeriod || 'Not stated'} unknown={!opportunity.compensation.payPeriod} />
        <Fact label="Published by employer" value={published(opportunity)} unknown={opportunity.publishedAtStatus !== 'published'} />
        <Fact label="First seen here" value={when(opportunity.firstSeenAt)} />
        <Fact label="Last seen" value={when(opportunity.lastSeenAt)} />
        <Fact label="Last checked" value={when(opportunity.lastCheckedAt)} />
        <Fact label="Work authorization" value={opportunity.workAuthorization.status === 'stated' ? opportunity.workAuthorization.excerpt : 'Not stated'} unknown={opportunity.workAuthorization.status !== 'stated'} />
        <Fact label="Experience" value={opportunity.experience.status === 'published' ? [opportunity.experience.seniority, opportunity.experience.yearsText].filter(Boolean).join(' · ') : 'Not stated'} unknown={opportunity.experience.status !== 'published'} />
        <Fact label="Listing status" value={`${opportunity.listingStatus}${opportunity.presenceConfidence === 'unverified' ? ' · presence unverified' : ''}`} />
        <Fact label="Source check" value={source ? `${source.status} · last run ${source.lastRunStatus}` : 'Source record unavailable'} />
      </section>

      <section className="panel p-5">
        <h3 className="font-semibold">Published requirements</h3>
        {opportunity.skills.status !== 'published' && <p className="mt-2 text-sm text-slate-500">Required and preferred skills were not published in separate sections.</p>}
        {opportunity.skills.status === 'published' && (
          <div className="mt-3 grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <p className="text-slate-600">Required</p>
              <ul className="mt-1 list-disc pl-5">{opportunity.skills.required.map((item) => <li key={item}>{item}</li>)}</ul>
              {opportunity.skills.required.length === 0 && <p className="text-slate-500">None listed under a required heading.</p>}
            </div>
            <div>
              <p className="text-slate-600">Preferred</p>
              <ul className="mt-1 list-disc pl-5">{opportunity.skills.preferred.map((item) => <li key={item}>{item}</li>)}</ul>
              {opportunity.skills.preferred.length === 0 && <p className="text-slate-500">None listed under a preferred heading.</p>}
            </div>
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h3 className="font-semibold">Description</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{opportunity.descriptionText || 'No description was published.'}</p>
      </section>

      <section className="panel p-5">
        <h3 className="font-semibold">Apply</h3>
        <p className="mt-1 text-sm text-slate-600">
          {payload.resume ? `Resume on file: ${payload.resume.fileName}.` : 'Upload a resume on the Resume tab first.'}
          {' '}The application is completed on the employer’s site or on Dice. LinkedIn and Indeed do not offer a public job search this app can read, and none of those sites accept the application from here.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" type="button" onClick={openApplication}>Open employer application</button>
          {payload.application && payload.application.status !== 'submitted_by_me' && (
            <button className="btn-quiet" type="button" onClick={markSubmitted}>I submitted this on the employer site</button>
          )}
        </div>
        {payload.application && (
          <p className="mt-2 text-sm text-slate-700">
            {payload.application.status === 'submitted_by_me' ? 'You marked this as submitted by you.' : 'Employer application opened. Nothing was sent from this app.'}
          </p>
        )}
      </section>

      <section className="panel p-5">
        <h3 className="font-semibold">Personal tracking</h3>
        <p className="mt-1 text-sm text-slate-600">Saved on this account only. Nothing is sent to the employer.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm">Status
            <select className="field" value={personalStatus} onChange={(event) => setPersonalStatus(event.target.value)}>
              {PERSONAL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm">Notes
            <input className="field" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
        <button className="btn mt-3" type="button" onClick={save}>Save for me</button>
        {payload.notice && <p className="mt-2 text-sm text-slate-600">{payload.notice}</p>}
      </section>

      <section className="panel p-5 text-sm text-slate-600">
        <p>Source job ID {opportunity.sourceJobId}. Content hash {opportunity.contentHash}.</p>
        <p className="mt-1">Reposts recorded: {opportunity.repostCount}.</p>
        {opportunity.changeLog.length > 0 && (
          <ul className="mt-2 space-y-1">
            {opportunity.changeLog.map((change, index) => (
              <li key={index}>{when(change.at)} · {change.summary}</li>
            ))}
          </ul>
        )}
        {opportunity.listingStatusEvidence && opportunity.listingStatusEvidence.note && (
          <p className="mt-2">{opportunity.listingStatusEvidence.note}</p>
        )}
      </section>
    </div>
  );
}

function Classification({ opportunity, onSaved }) {
  const [employerType, setEmployerType] = useState(opportunity.employerType || 'unknown');
  const [hiringRelationship, setHiringRelationship] = useState(opportunity.hiringRelationship || 'unknown');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState('');

  async function save(event) {
    event.preventDefault();
    try {
      const body = await api(`/api/opportunities/${opportunity.id}/classification`, {
        method: 'POST',
        body: JSON.stringify({ employerType, hiringRelationship, evidence }),
      });
      setError('');
      onSaved(body.opportunity);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="mt-4 grid gap-2 md:grid-cols-3" onSubmit={save}>
      <label className="text-sm">Employer type
        <select className="field" value={employerType} onChange={(event) => setEmployerType(event.target.value)}>
          <option value="end_user">End-user organization</option>
          <option value="consulting_firm">Consulting / implementation firm</option>
          <option value="staffing_agency">Staffing / recruitment agency</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>
      <label className="text-sm">Hiring relationship
        <select className="field" value={hiringRelationship} onChange={(event) => setHiringRelationship(event.target.value)}>
          <option value="own_team">Hiring for its own team</option>
          <option value="named_client">Hiring for a named client</option>
          <option value="undisclosed_client">Hiring for an undisclosed client</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>
      <label className="text-sm">Correction note
        <input className="field" value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Why this correction is right" />
      </label>
      {error && <p className="text-sm text-amber-800 md:col-span-3">{error}</p>}
      <button className="btn md:col-span-3" type="submit">Save classification</button>
    </form>
  );
}

function Fact({ label, value, unknown }) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-sm ${unknown ? 'text-slate-500' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
