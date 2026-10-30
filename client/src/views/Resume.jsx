import { useEffect, useState } from 'react';
import { api, uploadResume } from '../api';
import { when } from '../labels';

export default function Resume() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    return api('/api/profile').then(setProfile);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function onFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    try {
      await uploadResume(file);
      setMessage('Resume saved on this account only.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!profile) return <p className="text-sm text-slate-600">Loading resume…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Resume</h2>
        <p className="text-sm text-slate-600">Upload a PDF or Word file once. Apply on a listing opens the employer’s form so you can attach this file there.</p>
      </div>
      {error && <p className="text-sm text-amber-800">{error}</p>}
      {message && <p className="text-sm text-cyan-800">{message}</p>}
      <section className="panel space-y-3 p-5">
        <p className="text-sm text-slate-700">
          {profile.resume ? `${profile.resume.fileName} · ${Math.ceil(profile.resume.bytes / 1024)} KB · uploaded ${when(profile.resume.uploadedAt)}` : 'No resume uploaded.'}
        </p>
        <label className="btn inline-flex cursor-pointer">
          Upload resume
          <input className="sr-only" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFile} />
        </label>
        {profile.resume && <a className="btn-quiet" href="/api/profile/resume">Download resume</a>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Applications you opened</h3>
        {profile.applications.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
        {profile.applications.map((item) => (
          <article key={item.id} className="panel p-4 text-sm">
            <p>{item.status === 'submitted_by_me' ? 'Marked submitted by you' : 'Opened on the employer site'}</p>
            <p className="text-slate-600">{item.resumeFileName} · {when(item.openedAt)}</p>
            {item.employerUrl && <a className="text-cyan-700" href={item.employerUrl} target="_blank" rel="noreferrer">Employer application</a>}
          </article>
        ))}
      </section>
    </div>
  );
}
