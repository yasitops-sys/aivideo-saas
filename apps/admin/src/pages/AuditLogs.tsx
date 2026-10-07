import { useEffect, useState } from 'react';
import { ChevronDown, ScrollText, Search } from 'lucide-react';
import { api, type AuditLog, type Paginated } from '../lib/api';
import { formatDateTime, truncate } from '../lib/format';
import { Card, CardHeader, EmptyState, ErrorBox, Pagination, SkeletonRows, TableShell } from '../components/ui';

const PER_PAGE = 25;

export default function AuditLogs() {
  const [data, setData] = useState<Paginated<AuditLog> | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);

  const load = async () => {
    setError('');
    try {
      setData(
        await api.get<Paginated<AuditLog>>('/api/admin/audit-logs', {
          page,
          per_page: PER_PAGE,
          action: action || undefined,
          search: search || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, action, search]);

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const prettyJson = (s: unknown): string => {
    if (typeof s !== 'string') {
      try {
        return JSON.stringify(s, null, 2);
      } catch {
        return String(s);
      }
    }
    try {
      return JSON.stringify(JSON.parse(s), null, 2);
    } catch {
      return s;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Audit logs</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Immutable record of every admin action — who did what, to whom, when
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
                placeholder="Admin email or target…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
          <div className="min-w-[200px]">
            <label className="label">Action (prefix match)</label>
            <input
              className="input"
              placeholder="e.g. credits.adjust"
              value={action}
              onChange={(e) => {
                setAction(e.target.value.trim());
                setPage(1);
              }}
            />
          </div>
          <button type="submit" className="btn-primary">
            Search
          </button>
          {(search || action) && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSearch('');
                setSearchInput('');
                setAction('');
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
        <CardHeader title="Audit trail" subtitle={data ? `${data.total} entries` : undefined} />
        <TableShell minWidth={1000}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th" />
              <th className="th">Timestamp</th>
              <th className="th">Admin</th>
              <th className="th">Action</th>
              <th className="th">Target</th>
              <th className="th">IP</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows rows={10} cols={6} />
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon={<ScrollText size={24} />} title="No audit entries found" />
                </td>
              </tr>
            ) : (
              data.items.flatMap((log) => {
                const open = openRow === log.id;
                const rows = [
                  <tr
                    key={log.id}
                    onClick={() => setOpenRow(open ? null : log.id)}
                    className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="td w-10">
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </td>
                    <td className="td text-slate-500">{formatDateTime(log.created_at)}</td>
                    <td className="td font-semibold">{log.admin_email ?? log.admin?.email ?? '—'}</td>
                    <td className="td">
                      <code className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        {log.action}
                      </code>
                    </td>
                    <td className="td text-slate-500">
                      {log.target_type ? `${log.target_type}:${truncate(log.target_id ?? '', 12)}` : '—'}
                    </td>
                    <td className="td text-slate-500">{log.ip_address ?? '—'}</td>
                  </tr>,
                ];
                if (open) {
                  rows.push(
                    <tr key={`${log.id}-details`} className="border-t border-slate-100 dark:border-slate-800">
                      <td />
                      <td colSpan={5} className="px-4 py-3">
                        <p className="label">Details (JSON)</p>
                        <pre className="scroll-thin max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-emerald-300">
                          {prettyJson(log.details)}
                        </pre>
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })
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
