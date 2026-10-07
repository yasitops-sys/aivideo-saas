import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { AuthShell } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ApiError } from '../lib/api';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from || '/dashboard';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      toast('Welcome back!', 'success');
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Log in to create stunning AI videos.">
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
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline">
            Forgot password?
          </Link>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          <LogIn className="w-4 h-4" /> {busy ? 'Logging in…' : 'Log in'}
        </button>
        <p className="text-sm text-center text-slate-500 dark:text-slate-400">
          No account yet?{' '}
          <Link to="/register" className="font-semibold text-violet-600 dark:text-violet-400 hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
