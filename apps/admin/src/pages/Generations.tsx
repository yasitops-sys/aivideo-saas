import { useEffect, useState } from 'react';
import { Clapperboard, ExternalLink, Search } from 'lucide-react';
import { api, type Generation, type Paginated } from '../lib/api';
import { formatDateTime, truncate } from '../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Pagination, SkeletonRows, TableShell } from '../components/ui';

const PER_PAGE = 20;
const STATUSES = ['', 'queued', 'processing', 'completed', 'failed', 'refunded'];

export default function Generations() {
  const [data, setData] = useState<Paginated<Generation> | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setError('');
    try {
      setData(
        await api.get<Paginated<Generation>>('/api/admin/generations', {
          page,
          per_page: PER_PAGE,
          status: status || undefined,
          search: search || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load generations');
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
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Generations</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">All video generations across every user</p>
      </div>

      <Card className="p-4">
        <form onSubmit={applySearch} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="label">Search</label>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Prompt text or user email…"
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
        <CardHeader title="All generations" subtitle={data ? `${data.total} total` : undefined} />
        <TableShell minWidth={1000}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th">Prompt</th>
              <th className="th">User</th>
              <th className="th">Model</th>
              <th className="th">Type</th>
              <th className="th">Dur / AR</th>
              <th className="th">Status</th>
              <th className="th text-right">Credits</th>
              <th className="th">Created</th>
              <th className="th">Video</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows rows={8} cols={9} />
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <EmptyState icon={<Clapperboard size={24} />} title="No generations found" />
                </td>
              </tr>
            ) : (
              data.items.map((g) => (
                <tr key={g.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="td max-w-[260px] truncate" title={g.prompt}>
                    {truncate(g.prompt, 56)}
                    {g.error_message && (
                      <p className="truncate text-xs text-red-500" title={g.error_message}>
                        {g.error_message}
                      </p>
                    )}
                  </td>
                  <td className="td text-slate-500">{g.user_email ?? g.user?.email ?? '—'}</td>
                  <td className="td">{g.model?.name ?? '—'}</td>
                  <td className="td text-slate-500">{g.generation_type.replace('_', '→')}</td>
                  <td className="td text-slate-500">
                    {g.duration_seconds}s · {g.aspect_ratio}
                  </td>
                  <td className="td">
                    <Badge tone={g.status}>{g.status}</Badge>
                  </td>
                  <td className="td text-right font-semibold text-slate-900 dark:text-white">
                    {g.credits_charged || g.credits_reserved}
                  </td>
                  <td className="td text-slate-500">{formatDateTime(g.created_at)}</td>
                  <td className="td">
                    {g.video_url ? (
                      <a href={g.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                        <ExternalLink size={14} /> Open
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
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
