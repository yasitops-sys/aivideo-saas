import type { Generation } from '../lib/api';

const styles: Record<string, string> = {
  queued: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
  processing: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30',
  completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30',
  refunded: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30',
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = styles[status] || styles.refunded;
  return <span className={`badge ${cls}`}>{status.replace('_', ' ')}</span>;
}

export function genStatus(g: Generation) {
  return <StatusBadge status={g.status} />;
}
