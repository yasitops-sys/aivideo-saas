import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const settings = useSettings();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative">
      <div className="fixed inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[350px] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[250px] rounded-full bg-fuchsia-600/15 blur-[100px]" />
      </div>
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-glow">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-xl tracking-tight">{settings.site_name}</span>
        </Link>
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{subtitle}</p>
          )}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
