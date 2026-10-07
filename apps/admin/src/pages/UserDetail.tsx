import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  KeyRound,
  Trash2,
  Undo2,
} from 'lucide-react';
import { ApiError, api, type UserDetail } from '../lib/api';
import { formatDateTime, formatMoney, formatNumber, timeAgo, truncate } from '../lib/format';
import {
  Badge,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorBox,
  Field,
  Modal,
  Spinner,
  Stat,
  TableShell,
} from '../components/ui';

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustError, setAdjustError] = useState('');

  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setError('');
    try {
      setUser(await api.get<UserDetail>(`/api/admin/users/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load user');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const doSuspend = async (isActive: boolean) => {
    setBusy(true);
    try {
      await api.patch(`/api/admin/users/${id}`, { is_active: isActive });
      setConfirmSuspend(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/api/admin/users/${id}`);
      navigate('/admin/users');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setBusy(false);
    }
  };

  const doResetPassword = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ token?: string; reset_token?: string }>(`/api/admin/users/${id}/reset-password`, {});
      const token = res.token ?? res.reset_token;
      if (!token) throw new Error('Backend did not return a reset token.');
      setResetToken(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  const doAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError('');
    const amount = Number.parseInt(adjustAmount, 10);
    if (!Number.isInteger(amount) || amount === 0) {
      setAdjustError('Enter a non-zero whole number. Positive adds credits, negative removes.');
      return;
    }
    if (adjustReason.trim().length < 5) {
      setAdjustError('Reason must be at least 5 characters (audit requirement).');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/admin/credits/adjust', { user_id: id, amount, reason: adjustReason.trim() });
      setAdjustOpen(false);
      setAdjustAmount('');
      setAdjustReason('');
      await load();
    } catch (err) {
      setAdjustError(err instanceof ApiError ? err.message : 'Adjustment failed');
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (resetToken) {
      await navigator.clipboard.writeText(resetToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (error && !user) return <ErrorBox message={error} onRetry={load} />;
  if (!user) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-64 animate-pulse lg:col-span-1" />
        <Card className="h-64 animate-pulse lg:col-span-2" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600">
        <ArrowLeft size={16} /> Back to users
      </Link>

      {error && <ErrorBox message={error} />}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* profile card */}
        <Card>
          <CardHeader title="Profile" />
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-extrabold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                {(user.full_name || user.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-slate-900 dark:text-white">{user.full_name}</p>
                <p className="truncate text-sm text-slate-500">{user.email}</p>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <Row k="Role" v={<Badge tone={user.role}>{user.role}</Badge>} />
              <Row
                k="Status"
                v={
                  user.is_active ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><CheckCircle2 size={15} /> Active</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-red-600"><Ban size={15} /> Suspended</span>
                  )
                }
              />
              <Row
                k="Email verified"
                v={
                  user.email_verified ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-600"><BadgeCheck size={15} /> Yes</span>
                  ) : (
                    <span className="text-slate-500">No</span>
                  )
                }
              />
              <Row k="Joined" v={formatDateTime(user.created_at)} />
              <Row k="User ID" v={<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{user.id}</code>} />
            </dl>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button className="btn-secondary text-xs" onClick={() => setAdjustOpen(true)}>
                <Coins size={15} /> Adjust credits
              </button>
              <button className="btn-secondary text-xs" onClick={doResetPassword} disabled={busy}>
                <KeyRound size={15} /> Reset password
              </button>
              <button
                className="btn-secondary text-xs"
                onClick={() => setConfirmSuspend(true)}
                disabled={busy}
              >
                {user.is_active ? <><Ban size={15} /> Suspend</> : <><Undo2 size={15} /> Reactivate</>}
              </button>
              <button className="btn-danger text-xs" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>
        </Card>

        {/* credit stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <Stat icon={<Coins size={20} />} label="Credit balance" value={formatNumber(user.credit_balance)} />
          <Stat icon={<Coins size={20} />} label="Total purchased" value={formatNumber(user.totals.purchased)} />
          <Stat icon={<Coins size={20} />} label="Total consumed" value={formatNumber(user.totals.used)} />
          <Stat icon={<Coins size={20} />} label="Generations / Payments" value={`${user.totals.generations} / ${user.totals.payments}`} />
        </div>
      </div>

      {/* recent generations */}
      <Card>
        <CardHeader title="Recent generations" action={<Link to={`/admin/generations?user_id=${user.id}`} className="text-sm font-semibold text-indigo-600 hover:underline">View all</Link>} />
        {user.recent_generations.length === 0 ? (
          <EmptyState icon={<Coins size={24} />} title="No generations yet" />
        ) : (
          <TableShell minWidth={760}>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="th">Prompt</th>
                <th className="th">Model</th>
                <th className="th">Status</th>
                <th className="th text-right">Credits</th>
                <th className="th">Created</th>
                <th className="th">Video</th>
              </tr>
            </thead>
            <tbody>
              {user.recent_generations.map((g) => (
                <tr key={g.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="td max-w-[280px] truncate" title={g.prompt}>{truncate(g.prompt, 52)}</td>
                  <td className="td">{g.model?.name ?? '—'}</td>
                  <td className="td"><Badge tone={g.status}>{g.status}</Badge></td>
                  <td className="td text-right font-semibold">{g.credits_charged || g.credits_reserved}</td>
                  <td className="td text-slate-500">{timeAgo(g.created_at)}</td>
                  <td className="td">
                    {g.video_url ? (
                      <a href={g.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline">
                        <ExternalLink size={14} /> Open
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      {/* recent payments */}
      <Card>
        <CardHeader title="Recent payments" action={<Link to="/admin/payments" className="text-sm font-semibold text-indigo-600 hover:underline">View all</Link>} />
        {user.recent_payments.length === 0 ? (
          <EmptyState icon={<Coins size={24} />} title="No payments yet" />
        ) : (
          <TableShell minWidth={760}>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="th">Package</th>
                <th className="th text-right">Amount</th>
                <th className="th">Status</th>
                <th className="th">Created</th>
              </tr>
            </thead>
            <tbody>
              {user.recent_payments.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="td">{p.package?.name ?? p.package_name ?? '—'}</td>
                  <td className="td text-right font-bold text-slate-900 dark:text-white">{formatMoney(p.amount_cents, p.currency)}</td>
                  <td className="td"><Badge tone={p.status}>{p.status}</Badge></td>
                  <td className="td text-slate-500">{formatDateTime(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      {/* suspend confirm */}
      {confirmSuspend && (
        <ConfirmDialog
          title={user.is_active ? 'Suspend user' : 'Reactivate user'}
          message={
            user.is_active
              ? `${user.email} will be blocked from signing in immediately. Their data and credits are kept.`
              : `${user.email} will be able to sign in again.`
          }
          confirmLabel={user.is_active ? 'Suspend account' : 'Reactivate account'}
          danger={user.is_active}
          busy={busy}
          onConfirm={() => doSuspend(!user.is_active)}
          onCancel={() => setConfirmSuspend(false)}
        />
      )}

      {/* delete confirm */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete account"
          message={`${user.email} will be soft-deleted. They will no longer be able to sign in. Their ledger history is preserved for audit. This can only be undone in the database.`}
          confirmLabel="Delete account"
          danger
          busy={busy}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {/* adjust credits modal */}
      {adjustOpen && (
        <Modal title="Adjust credits" onClose={() => setAdjustOpen(false)}>
          <form onSubmit={doAdjust} className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Current balance: <span className="font-bold text-slate-900 dark:text-white">{formatNumber(user.credit_balance)}</span> credits
            </div>
            {adjustError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {adjustError}
              </div>
            )}
            <Field label="Amount (signed integer)" hint="Positive adds credits, negative removes. Removal cannot take the balance below zero.">
              <input
                className="input"
                type="number"
                step="1"
                required
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g. 100 or -50"
              />
            </Field>
            <Field label="Reason (min 5 chars)" hint="Written to the immutable audit log with your admin ID and timestamp.">
              <textarea
                className="input"
                rows={3}
                required
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Why is this adjustment being made?"
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setAdjustOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy && <Spinner size={16} />} Apply adjustment
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* reset password token modal */}
      {resetToken && (
        <Modal title="Password reset token" onClose={() => setResetToken(null)}>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              This token is shown <strong>once</strong>. Share it with the user through a secure
              channel only. It expires in 1 hour and is single-use.
            </div>
            <Field label="One-time reset token">
              <div className="flex gap-2">
                <input className="input font-mono text-xs" readOnly value={resetToken} onFocus={(e) => e.target.select()} />
                <button type="button" className="btn-secondary shrink-0" onClick={copyToken}>
                  <Copy size={15} /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </Field>
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setResetToken(null)}>
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
      <dd className="text-right font-medium text-slate-800 dark:text-slate-100">{v}</dd>
    </div>
  );
}
