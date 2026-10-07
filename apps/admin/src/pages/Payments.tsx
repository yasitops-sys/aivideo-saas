import { useEffect, useState } from 'react';
import { CreditCard, Search } from 'lucide-react';
import { api, type Paginated, type Payment } from '../lib/api';
import { formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Pagination, SkeletonRows, TableShell } from '../components/ui';

const PER_PAGE = 20;
const STATUSES = ['', 'pending', 'completed', 'failed', 'refunded'];

export default function Payments() {
  const [data, setData] = useState<Paginated<Payment> | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setError('');
    try {
      setData(
        await api.get<Paginated<Payment>>('/api/admin/payments', {
          page,
          per_page: PER_PAGE,
          status: status || undefined,
          search: search || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, search]);

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Payments</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every payment record — credits are granted by verified webhooks only</p>
      </div>

      <Card className="p-4">
        <form onSubmit={applySearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="label">Search</label>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="User email…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === '' ? 'All statuses' : s}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Search
          </button>
          {(search || status) && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSearch('');
                setSearchInput('');
                setStatus('');
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </form>
      </Card>

      {error && <ErrorBox message={error} onRetry={load} />}

      <Card>
        <CardHeader title="All payments" subtitle={data ? `${formatNumber(data.total)} total` : undefined} />
        <TableShell minWidth={900}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th">User</th>
              <th className="th">Package</th>
              <th className="th text-right">Amount</th>
              <th className="th text-right">Credits</th>
              <th className="th">Status</th>
              <th className="th">Provider</th>
              <th className="th">Created</th>
              <th className="th">Completed</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows rows={8} cols={8} />
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState icon={<CreditCard size={24} />} title="No payments found" />
                </td>
              </tr>
            ) : (
              data.items.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="td font-semibold">{p.user_email ?? p.user?.email ?? '—'}</td>
                  <td className="td">{p.package?.name ?? p.package_name ?? '—'}</td>
                  <td className="td text-right font-bold text-slate-900 dark:text-white">
                    {formatMoney(p.amount_cents, p.currency)}
                  </td>
                  <td className="td text-right">{formatNumber(p.package?.credits ?? 0)}</td>
                  <td className="td">
                    <Badge tone={p.status}>{p.status}</Badge>
                  </td>
                  <td className="td text-slate-500">{p.provider}</td>
                  <td className="td text-slate-500">{formatDateTime(p.created_at)}</td>
                  <td className="td text-slate-500">{formatDateTime(p.completed_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
        {data && data.pages > 1 && (
          <Pagination page={data.page} pages={data.pages} total={data.total} perPage={data.per_page} onPage={setPage} />
        )}
      </Card>
    </div>
  );
}
