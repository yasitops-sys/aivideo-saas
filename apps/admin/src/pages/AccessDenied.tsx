import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export default function AccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-950">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This area requires an <span className="font-semibold">admin</span> or{' '}
          <span className="font-semibold">super admin</span> role. Your account does not have
          permission to view it. This attempt has been noted.
        </p>
        <Link to="/admin/login" className="btn-primary mt-6 w-full">
          Back to admin sign in
        </Link>
      </div>
    </div>
  );
}
