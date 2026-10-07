import { useEffect, useState } from 'react';
import { Pencil, Settings as SettingsIcon } from 'lucide-react';
import { ApiError, api, type Setting } from '../lib/api';
import { formatDateTime, truncate } from '../lib/format';
import { Card, CardHeader, EmptyState, ErrorBox, Field, Modal, SkeletonRows, Spinner, TableShell } from '../components/ui';

export default function Settings() {
  const [items, setItems] = useState<Setting[] | null>(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<Setting | null>(null);
  const [value, setValue] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {
      const data = await api.get<Setting[] | { settings: Setting[] }>('/api/admin/settings');
      setItems(Array.isArray(data) ? data : data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEdit = (s: Setting) => {
    setValue(displayValue(s.value));
    setFormError('');
    setModal(s);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    // Value must be valid JSON (contract: "value as JSON string").
    try {
      JSON.parse(value);
    } catch {
      setFormError('Value must be valid JSON (e.g. "My Site", 10, true, {"a":1}).');
      return;
    }
    if (!modal) return;
    setBusy(true);
    try {
      await api.put('/api/admin/settings', { key: modal.key, value });
      setModal(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const masked = (v: unknown) => typeof v === 'string' && (v === '********' || /^\*+$/.test(v.trim()));
  const displayValue = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">System settings</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Site-wide configuration. Sensitive values are masked by the backend — editing them requires super-admin.
        </p>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}

      <Card>
        <CardHeader title="Settings" subtitle={items ? `${items.length} keys` : undefined} />
        <TableShell minWidth={720}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th">Key</th>
              <th className="th">Value</th>
              <th className="th">Updated</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!items ? (
              <SkeletonRows rows={8} cols={4} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState icon={<SettingsIcon size={24} />} title="No settings found" />
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.key} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="td">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold dark:bg-slate-800">{s.key}</code>
                  </td>
                  <td className="td max-w-[420px] truncate font-mono text-xs text-slate-600 dark:text-slate-300" title={displayValue(s.value)}>
                    {masked(s.value) ? (
                      <span className="text-slate-400">•••••••• (masked)</span>
                    ) : (
                      truncate(displayValue(s.value), 80)
                    )}
                  </td>
                  <td className="td text-slate-500">{formatDateTime(s.updated_at)}</td>
                  <td className="td text-right">
                    <button className="btn-ghost rounded-lg p-1.5" onClick={() => openEdit(s)} aria-label={`Edit ${s.key}`}>
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      </Card>

      {modal && (
        <Modal title={`Edit setting: ${modal.key}`} onClose={() => setModal(null)}>
          <form onSubmit={submit} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </div>
            )}
            {masked(modal.value) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                This value is masked. Enter a new value to replace it, or cancel to keep the current one.
              </div>
            )}
            <Field label="Value (JSON)" hint='Must be valid JSON: strings need quotes, e.g. "My Site".'>
              <textarea
                className="input font-mono text-sm"
                rows={5}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder='"My Site"'
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy && <Spinner size={16} />} Save setting
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
