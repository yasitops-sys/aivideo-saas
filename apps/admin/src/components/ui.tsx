import { type ReactNode, useEffect } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

/* ---------- Card ---------- */
export function Card({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- Badge ---------- */
const badgeStyles: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  queued: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  processing: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  refunded: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  inactive: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  super_admin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  customer: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  purchase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  generation_reserve: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  generation_charge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  generation_refund: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  admin_adjust: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  signup_bonus: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  enabled: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  disabled: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  const cls = badgeStyles[tone] ?? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

/* ---------- Spinner / skeleton ---------- */
export function Spinner({ size = 20 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-indigo-600 dark:text-indigo-400" />;
}

export function SkeletonRows({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 w-full max-w-[180px] animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400 dark:bg-slate-800">{icon}</div>
      <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
      <AlertTriangle size={18} className="shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary px-3 py-1 text-xs">
          Retry
        </button>
      )}
    </div>
  );
}

/* ---------- Table wrapper ---------- */
export function TableShell({ children, minWidth = 720 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({
  page,
  pages,
  total,
  perPage,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{from}–{to}</span> of{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <button className="btn-ghost px-3 py-1 text-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Prev
        </button>
        {pageNumbers(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                p === page
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button className="btn-ghost px-3 py-1 text-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

function pageNumbers(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set<number>([1, 2, page - 1, page, page + 1, pages - 1, pages]);
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

/* ---------- Modal ---------- */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="btn-ghost rounded-lg p-1.5" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Confirm dialog ---------- */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
          {busy && <Spinner size={16} />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Stat card ---------- */
export function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">{icon}</div>
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </Card>
  );
}

/* ---------- Field ---------- */
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

/* ---------- Toggle ---------- */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
