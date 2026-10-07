import { useEffect, useState } from 'react';
import { Package as PackageIcon, Pencil, Plus } from 'lucide-react';
import { ApiError, api, type CreditPackage } from '../lib/api';
import { centsToDecimal, decimalToCents, formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { Badge, Card, EmptyState, ErrorBox, Field, Modal, SkeletonRows, Spinner, TableShell, Toggle } from '../components/ui';

interface FormState {
  name: string;
  credits: string;
  price: string;
  currency: string;
  is_active: boolean;
  sort_order: string;
}

const blank: FormState = { name: '', credits: '100', price: '9.99', currency: 'USD', is_active: true, sort_order: '0' };

export default function Packages() {
  const [items, setItems] = useState<CreditPackage[] | null>(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; pkg: CreditPackage }>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {
      setItems(await api.get<CreditPackage[]>('/api/admin/packages'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load packages');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm(blank);
    setFormError('');
    setModal({ mode: 'create' });
  };

  const openEdit = (pkg: CreditPackage) => {
    setForm({
      name: pkg.name,
      credits: String(pkg.credits),
      price: centsToDecimal(pkg.price_cents),
      currency: pkg.currency,
      is_active: pkg.is_active,
      sort_order: String(pkg.sort_order),
    });
    setFormError('');
    setModal({ mode: 'edit', pkg });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    let priceCents: number;
    try {
      priceCents = decimalToCents(form.price);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Invalid price');
      return;
    }
    const credits = Number.parseInt(form.credits, 10);
    if (!Number.isInteger(credits) || credits <= 0) {
      setFormError('Credits must be a positive whole number.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      credits,
      price_cents: priceCents,
      currency: form.currency.trim().toUpperCase() || 'USD',
      is_active: form.is_active,
      sort_order: Number.parseInt(form.sort_order, 10) || 0,
    };
    setBusy(true);
    try {
      if (modal && 'pkg' in modal) {
        await api.put(`/api/admin/packages/${modal.pkg.id}`, payload);
      } else {
        await api.post('/api/admin/packages', payload);
      }
      setModal(null);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Credit packages</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Prices and credit amounts are fully configurable — never hard-coded</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} /> New package
        </button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}

      <Card>
        <TableShell minWidth={820}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th">Name</th>
              <th className="th text-right">Credits</th>
              <th className="th text-right">Price</th>
              <th className="th">Currency</th>
              <th className="th">Status</th>
              <th className="th text-right">Sort</th>
              <th className="th">Updated</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!items ? (
              <SkeletonRows rows={4} cols={8} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState icon={<PackageIcon size={24} />} title="No packages yet" hint="Create your first credit package." />
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="td font-semibold text-slate-900 dark:text-white">{p.name}</td>
                  <td className="td text-right font-bold">{formatNumber(p.credits)}</td>
                  <td className="td text-right font-semibold">{formatMoney(p.price_cents, p.currency)}</td>
                  <td className="td text-slate-500">{p.currency}</td>
                  <td className="td">
                    <Badge tone={p.is_active ? 'active' : 'inactive'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="td text-right text-slate-500">{p.sort_order}</td>
                  <td className="td text-slate-500">{formatDateTime(p.created_at)}</td>
                  <td className="td text-right">
                    <button className="btn-ghost rounded-lg p-1.5" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
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
        <Modal title={modal.mode === 'create' ? 'New credit package' : `Edit ${('pkg' in modal && modal.pkg.name) || ''}`} onClose={() => setModal(null)}>
          <form onSubmit={submit} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </div>
            )}
            <Field label="Name">
              <input className="input" required maxLength={100} value={form.name} onChange={set('name')} placeholder="Starter" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Credits">
                <input className="input" required type="number" min={1} step={1} value={form.credits} onChange={set('credits')} />
              </Field>
              <Field label="Price (decimal)" hint="Converted to minor units (cents) on save.">
                <input className="input" required inputMode="decimal" value={form.price} onChange={set('price')} placeholder="9.99" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Currency (ISO code)">
                <input className="input" required maxLength={3} value={form.currency} onChange={set('currency')} placeholder="USD" />
              </Field>
              <Field label="Sort order">
                <input className="input" type="number" step={1} value={form.sort_order} onChange={set('sort_order')} />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Active (visible to customers)</span>
              <Toggle checked={form.is_active} onChange={(v) => setForm((f) => ({ ...f, is_active: v }))} label="Active" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy && <Spinner size={16} />} Save package
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
