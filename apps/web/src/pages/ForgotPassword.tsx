import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailSearch, ArrowLeft } from 'lucide-react';
import { AuthShell } from '../components/AuthShell';
import { api, ApiError } from '../lib/api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', json: { email: email.trim() } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset password" subtitle="We'll email you a reset link if the account exists.">
      {done ? (
        <div className="flex flex-col items-center text-center gap-3 py-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <MailSearch className="w-7 h-7 text-emerald-500" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            If an account exists for <strong>{email}</strong>, a password reset link is on its way.
            Check your inbox (and spam folder).
          </p>
          <Link to="/login" className="btn-secondary mt-2">
            <ArrowLeft className="w-4 h-4" /> Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm px-4 py-3">
              {error}
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
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
