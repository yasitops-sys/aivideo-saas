import { useEffect, useState } from 'react';
import { ArrowDownToLine, Plus, ShieldCheck } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { formatDateTime } from '../lib/format';
import { Badge, Card, CardHeader, ConfirmDialog, EmptyState, ErrorBox, Field, Modal, SkeletonRows, Spinner, TableShell } from '../components/ui';

interface AdminRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function Admins() {
  const { me } = useAuth();
  const [items, setItems] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'admin' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoteTarget, setDemoteTarget] = useState<AdminRow | null>(null);

  const load = async () => {
    setError('');
    try {
      setItems(await api.get<AdminRow[]>('/api/admin/admins'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admins');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/admin/admins', {
        email: form.email.trim().toLowerCase(),
        password: form.password,
        full_name: form.full_name.trim(),
        role: form.role,
      });
      setCreateOpen(false);
      setForm({ email: '', password: '', full_name: '', role: 'admin' });
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const doDemote = async () => {
    if (!demoteTarget) return;
    setBusy(true);
    try {
      await api.delete(`/api/admin/admins/${demoteTarget.id}`);
      setDemoteTarget(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Demote failed');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Administrators</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Super-admin only — manage who can access this console
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setFormError(''); setCreateOpen(true); }}>
          <Plus size={16} /> New admin
        </button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}

      <Card>
        <CardHeader title="Admin accounts" subtitle={items ? `${items.length} total` : undefined} />
        <TableShell minWidth={720}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th">Email</th>
              <th className="th">Name</th>
              <th className="th">Role</th>
              <th className="th">Status</th>
              <th className="th">Created</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!items ? (
              <SkeletonRows rows={4} cols={6} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon={<ShieldCheck size={24} />} title="No admins found" />
                </td>
              </tr>
            ) : (
              items.map((a) => {
                const isSelf = me?.id === a.id;
                return (
                  <tr key={a.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="td font-semibold text-slate-900 dark:text-white">
                      {a.email}
                      {isSelf && <span className="ml-2 text-xs font-medium text-slate-400">(you)</span>}
                    </td>
                    <td className="td">{a.full_name}</td>
                    <td className="td">
                      <Badge tone={a.role}>{a.role}</Badge>
                    </td>
                    <td className="td">
                      <Badge tone={a.is_active ? 'active' : 'inactive'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="td text-slate-500">{formatDateTime(a.created_at)}</td>
                    <td className="td text-right">
                      <button
                        className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={isSelf}
                        title={isSelf ? 'You cannot demote yourself' : 'Demote to customer'}
                        onClick={() => setDemoteTarget(a)}
                      >
                        <ArrowDownToLine size={14} className="mr-1 inline" />
                        Demote
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableShell>
      </Card>

      {createOpen && (
        <Modal title="New administrator" onClose={() => setCreateOpen(false)}>
          <form onSubmit={submitCreate} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </div>
            )}
            <Field label="Full name">
              <input className="input" required maxLength={255} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Password" hint="Minimum 8 characters. Share it with the new admin through a secure channel.">
              <input className="input" required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Role">
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">admin</option>
                <option value="super_admin">super_admin</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setCreateOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy && <Spinner size={16} />} Create admin
              </button>
            </div>
          </form>
        </Modal>
      )}

      {demoteTarget && (
        <ConfirmDialog
          title="Demote administrator"
          message={`${demoteTarget.email} will lose all admin access and become a regular customer. The backend blocks demoting the last super-admin.`}
          confirmLabel="Demote to customer"
          danger
          busy={busy}
          onConfirm={doDemote}
          onCancel={() => setDemoteTarget(null)}
        />
      )}
    </div>
  );
}
