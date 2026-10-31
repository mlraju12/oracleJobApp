import { useEffect, useState } from 'react';
import { Bookmark, Briefcase, Building2, Activity, ShieldAlert, LogOut, FileUp } from 'lucide-react';
import { api } from './api';
import Feed from './views/Feed';
import Detail from './views/Detail';
import Sources from './views/Sources';
import Health from './views/Health';
import Saved from './views/Saved';
import Review from './views/Review';
import Resume from './views/Resume';

const NAV = [
  ['feed', 'Opportunities', Briefcase],
  ['saved', 'Saved', Bookmark],
  ['sources', 'Sources', Building2],
  ['health', 'Collection', Activity],
  ['review', 'Review', ShieldAlert],
  ['resume', 'Resume', FileUp],
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
    <div className="min-h-screen bg-slate-200">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">SLP Microsystems</p>
            <h1 className="text-xl font-semibold">Oracle HCM Opportunities</h1>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{user.username}</span>
            <button
              className="btn-quiet"
              onClick={() => api('/api/auth/logout', { method: 'POST' }).then(() => setUser(null))}
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-3">
          {NAV.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === id || (view === 'detail' && id === 'feed') ? 'bg-cyan-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              onClick={() => setView(id)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {error && <p className="mb-4 text-sm text-amber-800">{error}</p>}
        {view === 'feed' && <Feed filters={filters} setFilters={setFilters} onOpen={openOpportunity} />}
        {view === 'detail' && <Detail id={selectedId} onBack={() => setView('feed')} />}
        {view === 'saved' && <Saved onOpen={openOpportunity} onApplySearch={(next) => { setFilters((current) => ({ ...current, ...next })); setView('feed'); }} />}
        {view === 'sources' && <Sources />}
        {view === 'health' && <Health />}
        {view === 'review' && <Review onOpen={openOpportunity} />}
        {view === 'resume' && <Resume />}
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center bg-slate-200 px-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">SLP Microsystems</p>
      <h1 className="mt-1 text-2xl font-semibold">Oracle HCM Opportunities</h1>
      <p className="mt-2 text-sm text-slate-600">
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
