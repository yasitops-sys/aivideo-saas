import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">{total} items</p>
      <div className="flex items-center gap-2">
        <button
          className="btn-secondary !px-3 !py-1.5"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium">
          {page} / {pages}
        </span>
        <button
          className="btn-secondary !px-3 !py-1.5"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
