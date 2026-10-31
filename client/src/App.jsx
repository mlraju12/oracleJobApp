import { useEffect, useState } from 'react';
import { Bookmark, Briefcase, Building2, Activity, ShieldAlert, LogOut, FileUp, ListChecks } from 'lucide-react';
import { api } from './api';
import Feed from './views/Feed';
import Detail from './views/Detail';
import Sources from './views/Sources';
import Health from './views/Health';
import Saved from './views/Saved';
import Review from './views/Review';
import Resume from './views/Resume';
import ApplyQueue from './views/ApplyQueue';

const NAV = [
  ['feed', 'Opportunities', Briefcase],
  ['saved', 'Saved', Bookmark],
  ['sources', 'Sources', Building2],
  ['health', 'Collection', Activity],
  ['review', 'Review', ShieldAlert],
  ['resume', 'Resume', FileUp],
  ['queue', 'Apply queue', ListChecks],
];

export default function App() {
  const [user, setUser] = useState(undefined);
  const [view, setView] = useState('feed');
  const [selectedId, setSelectedId] = useState(null);
  const [filters, setFilters] = useState({
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
    directEndClient: '',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/health')
      .then(() => api('/api/auth/me'))
      .then((data) => setUser(data.user))
      .catch((err) => {
        setUser(null);
        setError(err.message);
      });
  }, []);

  function openOpportunity(id) {
    setSelectedId(id);
    setView('detail');
  }

  if (user === undefined) {
    return <main className="p-8 text-slate-600">Loading…</main>;
  }
  if (!user) {
    return <Login onUser={setUser} />;
  }

  return (
    <div className="min-h-screen">
      <header className="relative bg-forest text-[#f7f1e6] shadow-[0_16px_40px_-24px_rgba(20,49,44,0.9)]">
        <div className="h-1 bg-gradient-to-r from-[#e8b86d] via-copper to-moss" />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#e8b86d]">SLP Microsystems</p>
            <h1 className="mt-1 text-3xl text-[#fffaf3]">Oracle HCM Opportunities</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-[#efe6d6]">
            <span className="rounded-full bg-white/10 px-3 py-1">{user.username}</span>
            <button
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1.5 text-sm text-[#fffaf3] hover:bg-white/10"
              onClick={() => api('/api/auth/logout', { method: 'POST' }).then(() => setUser(null))}
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-4">
          {NAV.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm ${view === id || (view === 'detail' && id === 'feed') ? 'bg-copper text-white shadow-sm' : 'text-[#efe6d6] hover:bg-white/10'}`}
              onClick={() => setView(id)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        {error && <p className="mb-4 text-sm text-amber-800">{error}</p>}
        {view === 'feed' && <Feed filters={filters} setFilters={setFilters} onOpen={openOpportunity} />}
        {view === 'detail' && <Detail id={selectedId} onBack={() => setView('feed')} />}
        {view === 'saved' && <Saved onOpen={openOpportunity} onApplySearch={(next) => { setFilters((current) => ({ ...current, ...next })); setView('feed'); }} />}
        {view === 'sources' && <Sources />}
        {view === 'health' && <Health />}
        {view === 'review' && <Review onOpen={openOpportunity} />}
        {view === 'resume' && <Resume />}
        {view === 'queue' && <ApplyQueue />}
      </main>
    </div>
  );
}

function Login({ onUser }) {
  const [mode, setMode] = useState('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const data = await api(path, {
        method: 'POST',
        body: JSON.stringify({ username, password, otp }),
      });
      if (data.mfaRequired) {
        setMfaRequired(true);
        return;
      }
      onUser(data.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-copper">SLP Microsystems</p>
      <h1 className="mt-2 text-4xl text-ink">Oracle HCM Opportunities</h1>
      <p className="mt-3 text-sm leading-6 text-[#5c564e]">
        Public Oracle HCM boards are collected for this account, including Deloitte, EY, PwC, and Accenture Federal. Upload a resume, then open the employer’s own application. This app does not submit the form.
      </p>
      <form className="panel mt-6 space-y-3 p-5" onSubmit={submit}>
        <label className="block text-sm">
          Username
          <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label className="block text-sm">
          Password
          <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>
        {mfaRequired && (
          <label className="block text-sm">
            Authentication code
            <input className="field" value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" />
          </label>
        )}
        {error && <p className="text-sm text-amber-800">{error}</p>}
        <button className="btn w-full" type="submit">{mode === 'register' ? 'Create account' : 'Sign in'}</button>
        <button
          className="btn-quiet w-full"
          type="button"
          onClick={() => { setMode(mode === 'register' ? 'signin' : 'register'); setError(''); }}
        >
          {mode === 'register' ? 'I already have an account' : 'Create an account'}
        </button>
      </form>
    </main>
  );
}
