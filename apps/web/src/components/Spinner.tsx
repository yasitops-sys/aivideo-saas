export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <span
      className={`${cls} inline-block rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
