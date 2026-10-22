// Staff lead register at /admin. Loaded on demand, so public visitors never
// download this code. Access is enforced by the server on every request.
import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useNavigate, useSearchParams } from '../lib/router.jsx';
import { site } from '../config/site.js';
import { api } from './api.js';
import { Button, Notice, inputClass } from './parts.jsx';
import LeadList from './LeadList.jsx';
import LeadDetail from './LeadDetail.jsx';

function Login({ onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login(email, password);
      onDone(user);
    } catch (err) {
      setError(
        err.status === 429
          ? 'Too many sign-in attempts. Wait 15 minutes and try again.'
          : err.status === 401
            ? 'Email or password is incorrect, or this account does not have access.'
            : 'Sign-in is unavailable right now. Try again shortly.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh flex items-center justify-center px-gutter-mobile py-space-xl bg-surface">
      <form onSubmit={submit} className="w-full max-w-sm bg-surface-container-lowest rounded-2xl border border-surface-container-high p-space-lg flex flex-col gap-space-md depth-card" aria-labelledby="login-title">
        <div>
          <p className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">{site.name}</p>
          <h1 id="login-title" className="font-headline-md text-headline-md text-on-surface font-bold">
            Lead register
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">For authorised Adezmold staff only.</p>
        </div>
        {error && <Notice>{error}</Notice>}
        <label className="flex flex-col gap-1">
          <span className="font-label-lg text-label-lg">Email</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-label-lg text-label-lg">Password</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </label>
        <Button type="submit" disabled={busy}>
          <Icon name="lock" className="text-[18px]" /> {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}

export default function AdminApp() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [flash, setFlash] = useState(null);
  const params = useSearchParams();
  const navigate = useNavigate();
  const open = params.get('lead');

  useEffect(() => {
    document.title = `Lead register | ${site.name}`;
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = Object.assign(document.createElement('meta'), { name: 'robots' });
      document.head.append(meta);
    }
    meta.content = 'noindex, nofollow';
    api
      .session()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
    const signedOut = () => setUser(null);
    window.addEventListener('adz-admin-signed-out', signedOut);
    return () => window.removeEventListener('adz-admin-signed-out', signedOut);
  }, []);

  if (user === undefined) return <p className="p-space-lg text-on-surface-variant">Checking your session…</p>;
  if (user === null) return <Login onDone={setUser} />;

  const signOut = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  return (
    <div className="min-h-dvh bg-surface font-body-md text-body-md text-on-surface">
      <header className="sticky top-0 z-40 bg-primary-container text-white on-dark">
        <div className="mx-auto max-w-6xl px-gutter-mobile md:px-margin-tablet h-14 flex items-center justify-between gap-3">
          <button onClick={() => navigate('/admin')} className="flex items-center gap-2 min-w-0">
            <Icon name="checklist" className="text-tertiary-fixed text-[20px]" />
            <span className="font-label-lg text-label-lg truncate">Lead register</span>
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden sm:block font-body-sm text-body-sm text-on-primary-container truncate">
              {user.email} · {user.role}
            </span>
            <button onClick={signOut} className="min-h-[40px] px-3 rounded-lg border border-white/20 font-label-md text-label-md hover:bg-white/10">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-gutter-mobile md:px-margin-tablet py-space-md">
        {flash && (
          <div className="mb-space-md">
            <Notice kind="ok">{flash}</Notice>
          </div>
        )}
        {open ? (
          <LeadDetail
            reference={open}
            user={user}
            onBack={() => navigate('/admin')}
            onDeleted={(ref) => (setFlash(`Lead ${ref} was permanently deleted.`), navigate('/admin'))}
          />
        ) : (
          <>
            <h1 className="sr-only">Leads</h1>
            <LeadList user={user} onOpen={(ref) => (setFlash(null), navigate(`/admin?lead=${encodeURIComponent(ref)}`))} />
          </>
        )}
      </main>
    </div>
  );
}
