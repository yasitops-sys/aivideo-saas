import { useEffect, useState } from 'react';
import { Coins, Search } from 'lucide-react';
import { api, type CreditTransaction, type Paginated } from '../lib/api';
import { formatDateTime, formatNumber, truncate } from '../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Pagination, SkeletonRows, TableShell } from '../components/ui';

const PER_PAGE = 25;
const TYPES = [
  '',
  'purchase',
  'generation_reserve',
  'generation_charge',
  'generation_refund',
  'admin_adjust',
  'signup_bonus',
];

export default function Transactions() {
  const [data, setData] = useState<Paginated<CreditTransaction> | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || /^[0-9a-f]{32}$/i.test(s);

  const load = async () => {
    setError('');
    try {
      setData(
        await api.get<Paginated<CreditTransaction>>('/api/admin/credit-transactions', {
          page,
          per_page: PER_PAGE,
          type: type || undefined,
          // contract documents user_id + type; fall back to global `search` for emails
          user_id: search && isUuid(search) ? search : undefined,
          search: search && !isUuid(search) ? search : undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, type, search]);

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Credit transactions</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Immutable ledger — every credit movement, system-wide
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={applySearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="label">Search</label>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="User ID or email…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === '' ? 'All types' : t}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Search
          </button>
          {(search || type) && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSearch('');
                setSearchInput('');
                setType('');
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
        <CardHeader title="Ledger" subtitle={data ? `${formatNumber(data.total)} entries` : undefined} />
        <TableShell minWidth={1000}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th">Type</th>
              <th className="th">User</th>
              <th className="th text-right">Amount</th>
              <th className="th text-right">Before → After</th>
              <th className="th">Reference</th>
              <th className="th">Description</th>
              <th className="th">Created</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows rows={10} cols={7} />
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState icon={<Coins size={24} />} title="No transactions found" />
                </td>
              </tr>
            ) : (
              data.items.map((tx) => (
                <tr key={tx.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="td">
                    <Badge tone={tx.transaction_type}>{tx.transaction_type.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="td text-slate-500">{tx.user_email ?? '—'}</td>
                  <td className={`td text-right font-bold ${tx.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {tx.amount >= 0 ? '+' : ''}
                    {formatNumber(tx.amount)}
                  </td>
                  <td className="td text-right text-slate-500">
                    {formatNumber(tx.balance_before)} → {formatNumber(tx.balance_after)}
                  </td>
                  <td className="td">
                    {tx.reference_id ? (
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800" title={tx.reference_id}>
                        {truncate(tx.reference_id, 14)}
                      </code>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="td max-w-[240px] truncate text-slate-500" title={tx.description}>
                    {truncate(tx.description, 48)}
                  </td>
                  <td className="td text-slate-500">{formatDateTime(tx.created_at)}</td>
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
