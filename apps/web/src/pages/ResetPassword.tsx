import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { AuthShell } from '../components/AuthShell';
import { api, ApiError } from '../lib/api';

export function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Invalid reset link.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        json: { token, new_password: password },
      });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed. The link may have expired.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password for your account.">
      {done ? (
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Password updated. Redirecting you to login…
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm px-4 py-3">
              {error}
            </div>
          )}
          <div>
            <label className="label" htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              className="input"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              className="input"
              placeholder="Repeat your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            <KeyRound className="w-4 h-4" /> {busy ? 'Updating…' : 'Update password'}
          </button>
          <Link
            to="/login"
            className="text-sm text-center font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            Back to login
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
