import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Coins, CreditCard, Check, Loader2, Package as PackageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import type { CreditPackage, Paginated, Payment } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { StatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { PageLoader } from '../components/Spinner';

export function Billing() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    if (params.get('payment') === 'success') {
      toast('Payment successful — your credits are on the way.', 'success');
      refreshUser();
      setParams({}, { replace: true });
    } else if (params.get('payment') === 'cancelled') {
      toast('Payment was cancelled. No charges were made.', 'info');
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPayments = async (p: number) => {
    try {
      const data = await api<Paginated<Payment>>('/api/payments', {
        query: { page: p, per_page: 10 },
      });
      setPayments(data.items);
      setPage(data.page);
      setPages(data.pages);
      setTotal(data.total);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let alive = true;
    Promise.all([
      api<CreditPackage[]>('/api/packages').catch(() => []),
      loadPayments(1),
    ]).then(([pkgs]) => {
      if (!alive) return;
      const list = Array.isArray(pkgs) ? pkgs : (pkgs as any).items || [];
      setPackages(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buy = async (pkg: CreditPackage) => {
    setBuying(pkg.id);
    try {
      const res = await api<{ payment_id: string; checkout_url: string }>(
        '/api/payments/checkout',
        { method: 'POST', json: { package_id: pkg.id } },
      );
      window.location.href = res.checkout_url;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Checkout failed. Please try again.', 'error');
      setBuying(null);
    }
  };

  if (loading) return <PageLoader />;

  const popularIdx = packages.length >= 3 ? 1 : -1;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Billing</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Top up credits to keep generating. Payments are processed securely.
          </p>
        </div>
        <div className="card px-5 py-3 flex items-center gap-3 self-start">
          <Coins className="w-6 h-6 text-amber-500" />
          <div>
            <p className="text-xs text-slate-400">Current balance</p>
            <p className="text-xl font-extrabold tabular-nums">{user?.credit_balance ?? 0}</p>
          </div>
        </div>
      </div>

      {/* packages */}
      <div>
        <h2 className="text-lg font-bold mb-4">Credit packages</h2>
        {packages.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <PackageIcon className="w-8 h-8 mx-auto mb-2 text-slate-400" />
            No packages are currently available. Please check back soon.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map((pkg, i) => {
              const popular = i === popularIdx;
              return (
                <div
                  key={pkg.id}
                  className={`relative card p-6 flex flex-col gap-4 ${
                    popular ? 'ring-2 ring-violet-500 shadow-glow' : ''
                  }`}
                >
                  {popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 badge bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white whitespace-nowrap">
                      Most popular
                    </span>
                  )}
                  <div>
                    <h3 className="font-bold text-lg">{pkg.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {pkg.credits.toLocaleString()} credits
                    </p>
                  </div>
                  <p className="text-3xl font-extrabold">
                    {formatMoney(pkg.price_cents, pkg.currency)}
                  </p>
                  <ul className="text-sm text-slate-500 dark:text-slate-400 flex flex-col gap-1.5 flex-1">
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500" /> Never expires
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500" /> All AI models
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500" /> HD downloads
                    </li>
                  </ul>
                  <button
                    className="btn-primary w-full"
                    disabled={buying !== null}
                    onClick={() => buy(pkg)}
                  >
                    {buying === pkg.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4" />
                    )}
                    {buying === pkg.id ? 'Redirecting…' : 'Buy now'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          Credits are added automatically after your payment is confirmed by our payment provider.
        </p>
      </div>

      {/* payment history */}
      <div>
        <h2 className="text-lg font-bold mb-4">Payment history</h2>
        {payments.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No payments yet. Your purchase history will show up here.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200/60 dark:border-white/10">
                    <th className="px-4 py-3">Package</th>
                    <th className="px-4 py-3">Credits</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-semibold">{p.package.name}</td>
                      <td className="px-4 py-3 tabular-nums">{p.package.credits.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums">{formatMoney(p.amount_cents, p.currency)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(p.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <Pagination page={page} pages={pages} total={total} onPage={(p) => loadPayments(p)} />
      </div>

      <p className="text-xs text-slate-400">
        Need a custom plan or an invoice?{' '}
        <Link to="/settings" className="text-violet-500 hover:underline font-medium">
          Contact support
        </Link>
        .
      </p>
    </div>
  );
}
