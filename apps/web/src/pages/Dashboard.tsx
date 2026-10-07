import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, Film, Zap, Sparkles, ArrowRight, Bell, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { api } from '../lib/api';
import type { Generation, Notification, Paginated } from '../lib/api';
import { formatDate, timeAgo, truncate } from '../lib/format';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { PageLoader } from '../components/Spinner';

export function Dashboard() {
  const { user } = useAuth();
  const settings = useSettings();
  const [credits, setCredits] = useState<{ balance: number; total_purchased: number; total_used: number } | null>(null);
  const [recent, setRecent] = useState<Generation[]>([]);
  const [totalVideos, setTotalVideos] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api<{ balance: number; total_purchased: number; total_used: number }>('/api/credits'),
      api<Paginated<Generation>>('/api/generations', { query: { per_page: 5 } }),
      api<Notification[]>('/api/notifications', { query: { unread_only: false } }),
    ]).then(([c, g, n]) => {
      if (!alive) return;
      if (c.status === 'fulfilled') setCredits(c.value);
      if (g.status === 'fulfilled') {
        setRecent(g.value.items);
        setTotalVideos(g.value.total);
      }
      if (n.status === 'fulfilled') {
        const list = Array.isArray(n.value) ? n.value : (n.value as any).items || [];
        setNotifications(list.slice(0, 4));
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <PageLoader />;

  const balance = credits?.balance ?? user?.credit_balance ?? 0;
  const firstName = (user?.full_name || '').split(' ')[0] || 'Creator';

  return (
    <div className="flex flex-col gap-6">
      {/* greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Hey, {firstName} <span className="bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent">— let's create.</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Turn a single prompt into a video with {settings.site_name}.
          </p>
        </div>
        <Link to="/generate" className="btn-primary shrink-0">
          <Sparkles className="w-4 h-4" /> Generate Video <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* credit balance — big and prominent */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-glow">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-8 -bottom-12 w-40 h-40 rounded-full bg-black/10 blur-2xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <p className="text-sm font-medium text-white/70 uppercase tracking-wider">Credit balance</p>
            <p className="text-5xl sm:text-6xl font-extrabold mt-1 tabular-nums">{balance}</p>
            <p className="text-sm text-white/70 mt-2">
              {credits ? `${credits.total_used} used all-time · ${credits.total_purchased} purchased` : 'credits available'}
            </p>
          </div>
          <Link
            to="/billing"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-violet-700 font-bold px-6 py-3 hover:bg-white/90 active:scale-[0.98] transition shadow-lg shrink-0"
          >
            <Coins className="w-5 h-5" /> Buy credits
          </Link>
        </div>
        {balance < 20 && (
          <p className="relative mt-4 text-sm bg-white/15 rounded-xl px-4 py-2.5">
            Running low on credits — top up to keep generating without interruption.
          </p>
        )}
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
            <Film className="w-4 h-4" /> Videos generated
          </div>
          <p className="text-3xl font-extrabold mt-2 tabular-nums">{totalVideos}</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
            <Zap className="w-4 h-4" /> Credits used
          </div>
          <p className="text-3xl font-extrabold mt-2 tabular-nums">{credits?.total_used ?? 0}</p>
        </div>
        <div className="card p-5 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
            <Coins className="w-4 h-4" /> Credits purchased
          </div>
          <p className="text-3xl font-extrabold mt-2 tabular-nums">{credits?.total_purchased ?? 0}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* recent generations */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Recent generations</h2>
            <Link to="/history" className="text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              title="No videos yet"
              hint="Describe any scene and watch it come to life. Your first generation is one click away."
              action={
                <Link to="/generate" className="btn-primary mt-2">
                  <Sparkles className="w-4 h-4" /> Create your first video
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {recent.map((g) => (
                <Link key={g.id} to="/history" className="card p-4 flex items-center gap-4 hover:border-violet-500/40 transition">
                  <div className="w-20 h-14 rounded-lg overflow-hidden bg-slate-200 dark:bg-white/5 shrink-0 flex items-center justify-center">
                    {g.thumbnail_url ? (
                      <img src={g.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : g.status === 'completed' ? (
                      <Play className="w-5 h-5 text-violet-500" />
                    ) : (
                      <Film className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{truncate(g.prompt, 80)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {g.model.name} · {g.duration_seconds}s · {g.aspect_ratio} · {formatDate(g.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={g.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* notifications */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Bell className="w-5 h-5" /> Latest updates
          </h2>
          {notifications.length === 0 ? (
            <div className="card p-6 text-sm text-slate-500 dark:text-slate-400">
              Nothing here yet. Generation and payment updates will appear here.
            </div>
          ) : (
            <div className="card divide-y divide-slate-200/60 dark:divide-white/5">
              {notifications.map((n) => (
                <div key={n.id} className="p-4">
                  <p className="text-sm font-semibold">{n.title}</p>
                  {n.message && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
