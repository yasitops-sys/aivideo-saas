import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/api';

export function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { register } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await register(email.trim(), password, fullName.trim());
      toast('Account created — welcome aboard!', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Start generating AI videos in seconds.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm px-4 py-3">
            {error}
          </div>
        )}
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            className="input"
            placeholder="Jane Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
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
        <div>
          <label className="label" htmlFor="password">Password</label>
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
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          <UserPlus className="w-4 h-4" /> {busy ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="text-sm text-center text-slate-500 dark:text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-violet-600 dark:text-violet-400 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
