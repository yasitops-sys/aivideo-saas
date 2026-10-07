import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Clapperboard, Coins, CreditCard, DollarSign, Film, Users, UserX } from 'lucide-react';
import { api, type DashboardData } from '../lib/api';
import { formatMoney, formatNumber, timeAgo, truncate } from '../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, SkeletonRows, Stat, TableShell } from '../components/ui';
import { AreaChart, BarChart, DonutChart } from '../components/charts';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      setData(await api.get<DashboardData>('/api/admin/dashboard'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-28 animate-pulse" />
          ))}
        </div>
        <Card>
          <TableShell>
            <tbody>
              <SkeletonRows rows={5} cols={5} />
            </tbody>
          </TableShell>
        </Card>
      </div>
    );
  }

  const t = data.totals;
  // generations_by_status may arrive as [{status,count}] or {status: count}
  const statusData: { status: string; count: number }[] = Array.isArray(data.charts.generations_by_status)
    ? data.charts.generations_by_status
    : Object.entries(data.charts.generations_by_status ?? {}).map(([status, count]) => ({
        status,
        count: Number(count) || 0,
      }));
  const stats = [
    { icon: <Users size={20} />, label: 'Total users', value: formatNumber(t.users), sub: `${formatNumber(t.active_users)} active` },
    { icon: <CreditCard size={20} />, label: 'Total payments', value: formatNumber(t.payments) },
    { icon: <DollarSign size={20} />, label: 'Revenue', value: formatMoney(t.revenue_cents), sub: 'completed payments' },
    { icon: <Coins size={20} />, label: 'Credits sold', value: formatNumber(t.credits_sold) },
    { icon: <Coins size={20} />, label: 'Credits consumed', value: formatNumber(t.credits_consumed) },
    { icon: <Film size={20} />, label: 'Videos generated', value: formatNumber(t.videos_generated) },
    { icon: <AlertCircle size={20} />, label: 'Failed generations', value: formatNumber(t.failed_generations) },
    { icon: <UserX size={20} />, label: 'Inactive users', value: formatNumber(t.users - t.active_users) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Platform overview and recent activity</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Signups — last 30 days" />
          <div className="p-5">
            <BarChart data={data.charts.signups_by_day} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Revenue — last 30 days" />
          <div className="p-5">
            <AreaChart data={data.charts.revenue_by_day} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Generations by status" />
          <div className="p-5">
            <DonutChart data={statusData} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Recent users" action={<Link to="/admin/users" className="text-sm font-semibold text-indigo-600 hover:underline">View all</Link>} />
          {data.recent_users.length === 0 ? (
            <EmptyState icon={<Users size={24} />} title="No users yet" />
          ) : (
            <TableShell minWidth={320}>
              <tbody>
                {data.recent_users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${u.id}`} className="block">
                        <p className="truncate text-sm font-semibold text-slate-800 hover:text-indigo-600 dark:text-slate-100">{u.email}</p>
                        <p className="text-xs text-slate-500">{timeAgo(u.created_at)}</p>
                      </Link>
                    </td>
                    <td className="td text-right">
                      <Badge tone={u.role}>{u.role}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent payments" action={<Link to="/admin/payments" className="text-sm font-semibold text-indigo-600 hover:underline">View all</Link>} />
          {data.recent_payments.length === 0 ? (
            <EmptyState icon={<CreditCard size={24} />} title="No payments yet" />
          ) : (
            <TableShell minWidth={320}>
              <tbody>
                {data.recent_payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {p.user_email ?? p.user?.email ?? '—'}
                      </p>
                      <p className="text-xs text-slate-500">{timeAgo(p.created_at)}</p>
                    </td>
                    <td className="td text-right">
                      <p className="font-bold text-slate-900 dark:text-white">{formatMoney(p.amount_cents, p.currency)}</p>
                      <Badge tone={p.status}>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent generations" action={<Link to="/admin/generations" className="text-sm font-semibold text-indigo-600 hover:underline">View all</Link>} />
          {data.recent_generations.length === 0 ? (
            <EmptyState icon={<Clapperboard size={24} />} title="No generations yet" />
          ) : (
            <TableShell minWidth={320}>
              <tbody>
                {data.recent_generations.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3">
                      <p className="max-w-[220px] truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={g.prompt}>
                        {truncate(g.prompt, 48)}
                      </p>
                      <p className="text-xs text-slate-500">{timeAgo(g.created_at)}</p>
                    </td>
                    <td className="td text-right">
                      <Badge tone={g.status}>{g.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      </div>
    </div>
  );
}
