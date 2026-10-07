import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, MailCheck } from 'lucide-react';
import { AuthShell } from '../components/AuthShell';
import { api, ApiError } from '../lib/api';
import { Spinner } from '../components/Spinner';

export function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    api('/api/auth/verify-email', { method: 'POST', json: { token } })
      .then(() => setState('ok'))
      .catch((e) => {
        setState('error');
        setMessage(e instanceof ApiError ? e.message : 'Verification failed.');
      });
  }, [token]);

  return (
    <AuthShell title="Email verification">
      <div className="flex flex-col items-center text-center gap-3 py-4">
        {state === 'loading' && (
          <>
            <Spinner size="lg" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Verifying your email…</p>
          </>
        )}
        {state === 'ok' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="font-semibold">Email verified!</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your account is fully activated.
            </p>
            <Link to="/dashboard" className="btn-primary mt-2">
              Go to dashboard
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <p className="font-semibold">Verification failed</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
            <Link to="/login" className="btn-secondary mt-2">
              <MailCheck className="w-4 h-4" /> Back to login
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  );
}
