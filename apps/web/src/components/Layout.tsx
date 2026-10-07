import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Film,
  CreditCard,
  Receipt,
  Settings as SettingsIcon,
  Bell,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  Coins,
  CheckCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import type { Notification } from '../lib/api';
import { timeAgo } from '../lib/format';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/generate', label: 'Generate', icon: Sparkles },
  { to: '/history', label: 'My Videos', icon: Film },
  { to: '/billing', label: 'Billing', icon: CreditCard },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function linkCls({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
    isActive
      ? 'bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 text-violet-600 dark:text-violet-300 border border-violet-500/20'
      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
  }`;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = async () => {
    try {
      const data = await api<Notification[]>('/api/notifications', {
        query: { unread_only: true },
      });
      const list = Array.isArray(data) ? data : (data as any).items || [];
      setItems(list.slice(0, 10));
      setUnread(list.length);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    fetchUnread();
    const t = setInterval(fetchUnread, 30000);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => {
      clearInterval(t);
      document.removeEventListener('mousedown', onClick);
    };
  }, []);

  const openDropdown = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      try {
        await api('/api/notifications/read', {
          method: 'POST',
          json: { ids: items.map((n) => n.id) },
        });
        setUnread(0);
        setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      } catch (e) {
        if (e instanceof ApiError) toast(e.message, 'error');
      }
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={openDropdown}
        className="relative p-2.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-white/10 transition"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-fuchsia-600 text-white text-[11px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] card p-2 z-50">
          <div className="flex items-center justify-between px-3 py-2">
            <h3 className="font-bold text-sm">Notifications</h3>
            {unread > 0 && (
              <span className="badge bg-violet-500/15 text-violet-500 border border-violet-500/30">
                {unread} new
              </span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 px-3 py-6 text-center">
                You're all caught up.
              </p>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={`px-3 py-2.5 rounded-xl ${
                  n.is_read ? '' : 'bg-violet-500/[0.07]'
                }`}
              >
                <p className="text-sm font-semibold">{n.title}</p>
                {n.message && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                )}
                <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
              </div>
            ))}
          </div>
          {items.length > 0 && unread === 0 && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400 py-2">
              <CheckCheck className="w-3.5 h-3.5" /> All read
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const settings = useSettings();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  const brand = (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-2">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-glow">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <span className="font-extrabold text-lg tracking-tight truncate">
        {settings.site_name}
      </span>
    </Link>
  );

  return (
    <div className="min-h-screen">
      {/* ambient background */}
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-violet-600/15 dark:bg-violet-600/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full bg-fuchsia-600/10 dark:bg-fuchsia-600/15 blur-[120px]" />
      </div>

      {/* desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-64 glass border-r border-slate-200/60 dark:border-white/10 p-4 z-40">
        <div className="py-2">{brand}</div>
        <div className="card p-4 mt-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold">
            {(user?.full_name || user?.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{user?.full_name || 'User'}</p>
            <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-semibold">
              <Coins className="w-3.5 h-3.5" /> {user?.credit_balance ?? 0} credits
            </p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkCls}>
              <n.icon className="w-5 h-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={doLogout}
          className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-500 transition-all"
        >
          <LogOut className="w-5 h-5" /> Log out
        </button>
      </aside>

      {/* mobile topbar */}
      <header className="md:hidden sticky top-0 z-40 glass border-b border-slate-200/60 dark:border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-white/10"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          {brand}
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={toggle}
              className="p-2.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-white/10"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 inset-y-0 w-72 glass p-4 flex flex-col">
            <div className="flex items-center justify-between py-2">
              {brand}
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-200/60 dark:hover:bg-white/10"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="card p-4 mt-4 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold">
                {(user?.full_name || user?.email || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{user?.full_name || 'User'}</p>
                <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                  <Coins className="w-3.5 h-3.5" /> {user?.credit_balance ?? 0} credits
                </p>
              </div>
            </div>
            <nav className="flex flex-col gap-1 flex-1">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={linkCls} onClick={() => setMobileOpen(false)}>
                  <n.icon className="w-5 h-5" />
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <button
              onClick={doLogout}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-red-500/10 hover:text-red-500"
            >
              <LogOut className="w-5 h-5" /> Log out
            </button>
          </div>
        </div>
      )}

      {/* desktop topbar */}
      <header className="hidden md:flex sticky top-0 z-30 items-center justify-end gap-1 px-8 py-3 ml-64">
        <div className="glass rounded-2xl flex items-center gap-1 px-2 py-1">
          <NotificationBell />
          <button
            onClick={toggle}
            className="p-2.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-white/10 transition"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* content */}
      <main className="md:ml-64 px-4 sm:px-6 lg:px-8 pb-28 md:pb-12 pt-4 md:pt-2 max-w-6xl">
        <Outlet />
      </main>

      {/* mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-slate-200/60 dark:border-white/10">
        <div className="grid grid-cols-5 px-2 py-1.5">
          {NAV.slice(0, 5).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition ${
                  isActive
                    ? 'text-violet-600 dark:text-violet-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <n.icon className="w-5 h-5" />
              {n.label === 'My Videos' ? 'Videos' : n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
