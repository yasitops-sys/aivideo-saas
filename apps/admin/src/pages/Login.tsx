import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Field, Spinner } from '../components/ui';

export default function Login() {
  const { me, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && me && (me.role === 'admin' || me.role === 'super_admin')) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from || '/admin/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <Activity size={24} />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Admin Console</h1>
          <p className="mt-1 text-sm text-slate-400">Restricted area — administrators only</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          {error && (
            <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/50 px-3 py-2.5 text-sm text-red-300">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <Field label="Email">
              <input
                className="input"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
              />
            </Field>
            <Field label="Password">
              <input
                className="input"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
          </div>
          <button type="submit" className="btn-primary mt-6 w-full py-2.5" disabled={busy}>
            {busy ? <Spinner size={18} /> : <Lock size={16} />}
            Sign in to Admin Console
          </button>
          <p className="mt-4 text-center text-xs text-slate-500">
            Customer accounts cannot access this area.
          </p>
        </form>
      </div>
    </div>
  );
}
