import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Clapperboard,
  Coins,
  CreditCard,
  Cpu,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/generations', label: 'Generations', icon: Clapperboard },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/packages', label: 'Credit Packages', icon: Package },
  { to: '/admin/models', label: 'AI Models', icon: Cpu },
  { to: '/admin/transactions', label: 'Credit Transactions', icon: Coins },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/admins', label: 'Admins', icon: ShieldCheck, superOnly: true },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('admin-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('admin-theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  };
  if (!document.documentElement.dataset.themeInit) {
    document.documentElement.dataset.themeInit = '1';
    document.documentElement.classList.toggle('dark', dark);
  }
  return { dark, toggle };
}

export default function Layout() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const isSuper = me?.role === 'super_admin';
  const items = NAV.filter((i) => !i.superOnly || isSuper);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-slate-800/60 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Activity size={20} />
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-tight text-white">Admin Console</p>
          <p className="text-[11px] font-medium text-slate-400">Video SaaS · Control</p>
        </div>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <item.icon size={18} className="shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-800/60 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-white">
            {(me?.full_name || me?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{me?.full_name}</p>
            <p className="truncate text-xs text-slate-400">{me?.role.replace('_', ' ')}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${open ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-slate-950/60 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-72 bg-slate-900 transition-transform ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <button onClick={() => setOpen(false)} className="absolute right-3 top-3 text-slate-400" aria-label="Close menu">
            <X size={20} />
          </button>
          {sidebar}
        </aside>
      </div>

      {/* desktop sidebar */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 bg-slate-900 lg:block">{sidebar}</aside>

      <div className="lg:pl-64">
        {/* topbar */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <button onClick={() => setOpen(true)} className="btn-ghost rounded-lg p-2 lg:hidden" aria-label="Open menu">
              <Menu size={20} />
            </button>
            <p className="hidden text-sm font-semibold text-slate-500 dark:text-slate-400 lg:block">
              Signed in as <span className="text-slate-800 dark:text-slate-100">{me?.email}</span>
            </p>
            <div className="flex items-center gap-2">
              <button onClick={toggle} className="btn-ghost rounded-lg p-2" aria-label="Toggle theme">
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
