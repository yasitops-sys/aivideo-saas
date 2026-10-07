import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Download, Trash2, Film, Image as ImageIcon, AlertCircle, Sparkles, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { api, ApiError, TERMINAL_STATUSES } from '../lib/api';
import type { Generation, Paginated } from '../lib/api';
import { formatDate, truncate } from '../lib/format';
import { StatusBadge } from '../components/StatusBadge';
import { Pagination } from '../components/Pagination';
import { Modal } from '../components/Modal';
import { EmptyState } from '../components/EmptyState';
import { PageLoader } from '../components/Spinner';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

function DetailModal({
  gen,
  onClose,
  onDeleted,
}: {
  gen: Generation | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
  }, [gen?.id]);

  if (!gen) return null;
  const busy = gen.status === 'queued' || gen.status === 'processing';

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api(`/api/generations/${gen.id}`, { method: 'DELETE' });
      toast('Video deleted.', 'success');
      onDeleted(gen.id);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Delete failed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal open={!!gen} onClose={onClose} title="Generation details" wide>
      <div className="flex flex-col gap-4">
        {gen.video_url ? (
          <video
            key={gen.video_url}
            src={gen.video_url}
            controls
            playsInline
            poster={gen.thumbnail_url || undefined}
            className="w-full rounded-2xl bg-black max-h-[50vh]"
          />
        ) : gen.thumbnail_url ? (
          <img src={gen.thumbnail_url} alt="" className="w-full rounded-2xl max-h-[40vh] object-cover" />
        ) : (
          <div className="w-full h-48 rounded-2xl bg-slate-200 dark:bg-white/5 flex items-center justify-center">
            <Film className="w-10 h-10 text-slate-400" />
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={gen.status} />
          <span className="badge bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
            {gen.generation_type.replace(/_/g, ' ')}
          </span>
        </div>

        <div>
          <p className="label">Prompt</p>
          <p className="text-sm leading-relaxed">{gen.prompt}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="card p-3">
            <p className="text-xs text-slate-400">Model</p>
            <p className="font-semibold">{gen.model.name}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-slate-400">Duration</p>
            <p className="font-semibold">{gen.duration_seconds}s</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-slate-400">Aspect</p>
            <p className="font-semibold">{gen.aspect_ratio}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-slate-400">Credits used</p>
            <p className="font-semibold">{gen.credits_charged || gen.credits_reserved}</p>
          </div>
        </div>

        {gen.input_image_url && (
          <div>
            <p className="label flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4" /> Input image
            </p>
            <img src={gen.input_image_url} alt="Input" className="rounded-xl max-h-40 object-contain" />
          </div>
        )}

        {gen.error_message && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm px-4 py-3 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{gen.error_message}</span>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Created {formatDate(gen.created_at)}
          {gen.completed_at ? ` · Finished ${formatDate(gen.completed_at)}` : ''}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {gen.video_url && (
            <a href={gen.video_url} download className="btn-primary">
              <Download className="w-4 h-4" /> Download MP4
            </a>
          )}
          {!busy ? (
            confirmDelete ? (
              <>
                <button className="btn-danger" onClick={doDelete} disabled={deleting}>
                  <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Confirm delete'}
                </button>
                <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                  <X className="w-4 h-4" /> Cancel
                </button>
              </>
            ) : (
              <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )
          ) : (
            <p className="text-xs text-slate-400 self-center">
              Delete is available once the generation finishes.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function History() {
  const { toast } = useToast();
  const [items, setItems] = useState<Generation[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Generation | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (p: number, s: string) => {
    setLoading(true);
    try {
      const data = await api<Paginated<Generation>>('/api/generations', {
        query: { page: p, per_page: 12, status: s || undefined },
      });
      setItems(data.items);
      setPage(data.page);
      setPages(data.pages);
      setTotal(data.total);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Failed to load history.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load(1, status);
  }, [status, load]);

  // Poll active generations every 4s until terminal
  useEffect(() => {
    const active = items.filter((g) => !TERMINAL_STATUSES.includes(g.status));
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (active.length === 0) return;
    pollRef.current = setInterval(async () => {
      try {
        const updated = await Promise.all(
          active.map((g) => api<Generation>(`/api/generations/${g.id}`)),
        );
        setItems((prev) =>
          prev.map((g) => updated.find((u) => u.id === g.id) || g),
        );
        setSelected((sel) => {
          if (!sel) return sel;
          const u = updated.find((x) => x.id === sel.id);
          return u || sel;
        });
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [items.map((g) => g.id + g.status).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleted = (id: string) => {
    setItems((prev) => prev.filter((g) => g.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">My Videos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Every generation, with live status updates.
          </p>
        </div>
        <Link to="/generate" className="btn-primary shrink-0">
          <Sparkles className="w-4 h-4" /> New video
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${
              status === f.value
                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow'
                : 'bg-slate-200/70 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          hint={
            status
              ? `No ${status} generations found. Try a different filter.`
              : 'Your generated videos will appear here.'
          }
          action={
            <Link to="/generate" className="btn-primary mt-2">
              <Sparkles className="w-4 h-4" /> Generate a video
            </Link>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelected(g)}
              className="card overflow-hidden text-left hover:border-violet-500/40 transition group"
            >
              <div className="relative aspect-video bg-slate-200 dark:bg-white/5 flex items-center justify-center overflow-hidden">
                {g.thumbnail_url ? (
                  <img src={g.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Film className="w-8 h-8 text-slate-400" />
                )}
                {!TERMINAL_STATUSES.includes(g.status) && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  </div>
                )}
                {g.status === 'completed' && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-6 h-6 text-violet-700 ml-0.5" />
                    </div>
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <StatusBadge status={g.status} />
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold line-clamp-2 min-h-[2.5rem]">
                  {truncate(g.prompt, 90)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  {g.model.name} · {g.duration_seconds}s · {g.aspect_ratio} · {g.credits_charged || g.credits_reserved} credits
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">{formatDate(g.created_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} total={total} onPage={(p) => load(p, status)} />

      <DetailModal gen={selected} onClose={() => setSelected(null)} onDeleted={handleDeleted} />
    </div>
  );
}
