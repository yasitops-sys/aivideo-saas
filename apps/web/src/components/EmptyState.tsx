import { Film } from 'lucide-react';

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-10 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 flex items-center justify-center">
        {icon || <Film className="w-7 h-7 text-violet-500" />}
      </div>
      <h3 className="font-bold text-lg">{title}</h3>
      {hint && <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">{hint}</p>}
      {action}
    </div>
  );
}
