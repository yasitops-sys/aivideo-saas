import { useCallback, useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import type { CreditTransaction, Paginated } from '../lib/api';
import { formatDate, txLabel } from '../lib/format';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { PageLoader } from '../components/Spinner';

const TYPES = [
  { value: '', label: 'All types' },
  { value: 'purchase', label: 'Purchases' },
  { value: 'generation_reserve', label: 'Reservations' },
  { value: 'generation_charge', label: 'Charges' },
  { value: 'generation_refund', label: 'Refunds' },
  { value: 'admin_adjust', label: 'Admin adjustments' },
  { value: 'signup_bonus', label: 'Bonuses' },
];

export function Transactions() {
  const { toast } = useToast();
  const [items, setItems] = useState<CreditTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p: number, t: string) => {
      setLoading(true);
      try {
        const data = await api<Paginated<CreditTransaction>>('/api/credit-transactions', {
          query: { page: p, per_page: 15, type: t || undefined },
        });
        setItems(data.items);
        setPage(data.page);
        setPages(data.pages);
        setTotal(data.total);
      } catch (e) {
        toast(e instanceof ApiError ? e.message : 'Failed to load transactions.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    load(1, type);
  }, [type, load]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Credit ledger</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Every credit movement on your account, fully auditable.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${
              type === t.value
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow'
                : 'bg-slate-200/70 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState title="No transactions" hint="Your credit activity will appear here." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200/60 dark:border-white/10">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                {items.map((t) => {
                  const positive = t.amount > 0;
                  return (
                    <tr key={t.id}>
                      <td className="px-4 py-3">
                        <span className="badge bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20">
                          {txLabel(t.transaction_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 font-bold tabular-nums ${
                            positive ? 'text-emerald-500' : t.amount < 0 ? 'text-red-500' : 'text-slate-400'
                          }`}
                        >
                          {positive ? (
                            <ArrowDownRight className="w-4 h-4" />
                          ) : t.amount < 0 ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : null}
                          {t.amount > 0 ? `+${t.amount}` : t.amount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {t.balance_before} → {t.balance_after}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[280px] truncate">
                        {t.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(t.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} pages={pages} total={total} onPage={(p) => load(p, type)} />
    </div>
  );
}
