import { useEffect, useState } from 'react';
import { Cpu, Pencil, Plus } from 'lucide-react';
import { ApiError, api, type AiModel } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Field, Modal, SkeletonRows, Spinner, TableShell, Toggle } from '../components/ui';

const PROVIDERS = ['mock', 'replicate'];
const GEN_TYPES = ['text_to_video', 'image_to_video'];

interface FormState {
  name: string;
  provider: string;
  model_id: string;
  generation_type: string;
  credit_cost: string;
  durations: string;
  aspect_ratios: string;
  is_enabled: boolean;
}

const blank: FormState = {
  name: '',
  provider: 'mock',
  model_id: '',
  generation_type: 'text_to_video',
  credit_cost: '10',
  durations: '5,10',
  aspect_ratios: '16:9,9:16,1:1',
  is_enabled: true,
};

export default function Models() {
  const [items, setItems] = useState<AiModel[] | null>(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; model: AiModel }>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {
      setItems(await api.get<AiModel[]>('/api/admin/models'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load models');
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

  const openEdit = (m: AiModel) => {
    setForm({
      name: m.name,
      provider: m.provider,
      model_id: m.model_id,
      generation_type: m.generation_type,
      credit_cost: String(m.credit_cost),
      durations: m.durations.join(','),
      aspect_ratios: m.aspect_ratios.join(','),
      is_enabled: m.is_enabled,
    });
    setFormError('');
    setModal({ mode: 'edit', model: m });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!PROVIDERS.includes(form.provider)) {
      setFormError(`Provider must be one of: ${PROVIDERS.join(', ')}`);
      return;
    }
    const creditCost = Number.parseInt(form.credit_cost, 10);
    if (!Number.isInteger(creditCost) || creditCost <= 0) {
      setFormError('Credit cost must be a positive whole number.');
      return;
    }
    const durations = form.durations.split(',').map((s) => Number.parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 600);
    if (durations.length === 0) {
      setFormError('Durations must be comma-separated seconds, e.g. "5,10".');
      return;
    }
    const aspectRatios = form.aspect_ratios.split(',').map((s) => s.trim()).filter(Boolean);
    if (aspectRatios.length === 0) {
      setFormError('Aspect ratios must be comma-separated, e.g. "16:9,9:16,1:1".');
      return;
    }

    const payload = {
      name: form.name.trim(),
      provider: form.provider,
      model_id: form.model_id.trim(),
      generation_type: form.generation_type,
      credit_cost: creditCost,
      durations,
      aspect_ratios: aspectRatios,
      is_enabled: form.is_enabled,
    };
    setBusy(true);
    try {
      if (modal && 'model' in modal) {
        await api.put(`/api/admin/models/${modal.model.id}`, payload);
      } else {
        await api.post('/api/admin/models', payload);
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
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">AI models</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure models, providers and per-generation credit costs — no provider API keys ever reach the browser
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={16} /> New model
        </button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}

      <Card>
        <CardHeader title="Configured models" />
        <TableShell minWidth={900}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th">Name</th>
              <th className="th">Provider</th>
              <th className="th">Type</th>
              <th className="th text-right">Cost</th>
              <th className="th">Durations</th>
              <th className="th">Aspect ratios</th>
              <th className="th">Status</th>
              <th className="th">Updated</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!items ? (
              <SkeletonRows rows={4} cols={9} />
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <EmptyState icon={<Cpu size={24} />} title="No models yet" hint="Add your first AI model." />
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="td font-semibold text-slate-900 dark:text-white">{m.name}</td>
                  <td className="td">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{m.provider}</code>
                  </td>
                  <td className="td text-slate-500">{m.generation_type.replace('_', '→')}</td>
                  <td className="td text-right font-bold">{formatNumber(m.credit_cost)} cr</td>
                  <td className="td text-slate-500">{m.durations.map((d) => `${d}s`).join(', ')}</td>
                  <td className="td text-slate-500">{m.aspect_ratios.join(', ')}</td>
                  <td className="td">
                    <Badge tone={m.is_enabled ? 'enabled' : 'disabled'}>{m.is_enabled ? 'Enabled' : 'Disabled'}</Badge>
                  </td>
                  <td className="td text-slate-500">{formatDateTime(m.created_at)}</td>
                  <td className="td text-right">
                    <button className="btn-ghost rounded-lg p-1.5" onClick={() => openEdit(m)} aria-label={`Edit ${m.name}`}>
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
        <Modal title={modal.mode === 'create' ? 'New AI model' : `Edit ${('model' in modal && modal.model.name) || ''}`} onClose={() => setModal(null)}>
          <form onSubmit={submit} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Display name">
                <input className="input" required maxLength={100} value={form.name} onChange={set('name')} placeholder="CineFast T2V" />
              </Field>
              <Field label="Provider" hint={`Registered providers: ${PROVIDERS.join(', ')}`}>
                <select className="input" value={form.provider} onChange={set('provider')}>
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Provider model ID" hint="The provider-side model identifier (e.g. owner/model:version for Replicate).">
              <input className="input font-mono text-sm" required maxLength={255} value={form.model_id} onChange={set('model_id')} placeholder="mock-cinefast-v1" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Generation type">
                <select className="input" value={form.generation_type} onChange={set('generation_type')}>
                  {GEN_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Credit cost / generation">
                <input className="input" required type="number" min={1} step={1} value={form.credit_cost} onChange={set('credit_cost')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Durations (seconds)" hint='Comma-separated, e.g. "5,10".'>
                <input className="input" required value={form.durations} onChange={set('durations')} placeholder="5,10" />
              </Field>
              <Field label="Aspect ratios" hint='Comma-separated, e.g. "16:9,9:16,1:1".'>
                <input className="input" required value={form.aspect_ratios} onChange={set('aspect_ratios')} placeholder="16:9,9:16,1:1" />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Enabled (offered to customers)</span>
              <Toggle checked={form.is_enabled} onChange={(v) => setForm((f) => ({ ...f, is_enabled: v }))} label="Enabled" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy && <Spinner size={16} />} Save model
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
