import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Search, Users as UsersIcon, XCircle } from 'lucide-react';
import { api, type AdminUser, type Paginated } from '../lib/api';
import { formatDateTime, formatNumber } from '../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, Pagination, SkeletonRows, TableShell } from '../components/ui';

const PER_PAGE = 20;

export default function Users() {
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [active, setActive] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = async () => {
    setError('');
    try {
      setData(
        await api.get<Paginated<AdminUser>>('/api/admin/users', {
          page,
          per_page: PER_PAGE,
          search: search || undefined,
          role: role || undefined,
          is_active: active || undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, role, active]);

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Users</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Search, filter and manage customer accounts
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
                placeholder="Email or name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Role</label>
            <select
              className="input"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              <option value="customer">Customer</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super admin</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={active}
              onChange={(e) => {
                setActive(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Suspended</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Search
          </button>
          {(search || role || active) && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSearch('');
                setSearchInput('');
                setRole('');
                setActive('');
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
        <CardHeader title="All users" subtitle={data ? `${formatNumber(data.total)} total` : undefined} />
        <TableShell minWidth={900}>
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="th">Email</th>
              <th className="th">Name</th>
              <th className="th">Role</th>
              <th className="th">Status</th>
              <th className="th">Verified</th>
              <th className="th text-right">Credits</th>
              <th className="th">Joined</th>
            </tr>
          </thead>
          <tbody>
            {!data ? (
              <SkeletonRows rows={8} cols={7} />
            ) : data.items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState icon={<UsersIcon size={24} />} title="No users found" hint="Try adjusting your filters." />
                </td>
              </tr>
            ) : (
              data.items.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="td">
                    <Link to={`/admin/users/${u.id}`} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                      {u.email}
                    </Link>
                  </td>
                  <td className="td">{u.full_name}</td>
                  <td className="td">
                    <Badge tone={u.role}>{u.role}</Badge>
                  </td>
                  <td className="td">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={15} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                        <XCircle size={15} /> Suspended
                      </span>
                    )}
                  </td>
                  <td className="td">{u.email_verified ? 'Yes' : 'No'}</td>
                  <td className="td text-right font-bold text-slate-900 dark:text-white">{formatNumber(u.credit_balance)}</td>
                  <td className="td text-slate-500">{formatDateTime(u.created_at)}</td>
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
