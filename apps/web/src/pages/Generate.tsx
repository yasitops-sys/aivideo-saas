import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, ImagePlus, X, Coins, AlertTriangle, Wand2, Type, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import type { AIModel } from '../lib/api';
import { PageLoader } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 10;

export function Generate() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelId, setModelId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<number>(5);
  const [aspect, setAspect] = useState('16:9');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    let alive = true;
    api<AIModel[]>('/api/models')
      .then((m) => {
        if (!alive) return;
        const list = Array.isArray(m) ? m : (m as any).items || [];
        setModels(list);
        if (list.length > 0) {
          setModelId(list[0].id);
          setDuration(list[0].durations[0] ?? 5);
          setAspect(list[0].aspect_ratios[0] ?? '16:9');
        }
      })
      .catch(() => {
        /* handled by empty state */
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const model = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const needsImage = model?.generation_type === 'image_to_video';
  const balance = user?.credit_balance ?? 0;
  const cost = model?.credit_cost ?? 0;
  const cantAfford = model != null && balance < cost;

  const pickModel = (m: AIModel) => {
    setModelId(m.id);
    setDuration(m.durations[0] ?? 5);
    setAspect(m.aspect_ratios[0] ?? '16:9');
    if (m.generation_type === 'text_to_video') {
      setImage(null);
      setPreview(null);
    }
  };

  const validateImage = (f: File): string | null => {
    if (!ACCEPTED.includes(f.type)) return 'Only JPG, PNG or WebP images are allowed.';
    if (f.size > MAX_MB * 1024 * 1024) return `Image must be smaller than ${MAX_MB} MB.`;
    return null;
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const err = validateImage(f);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setImage(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!model) return;
    if (prompt.trim().length < 1) {
      setError('Please describe the video you want to create.');
      return;
    }
    if (needsImage && !image) {
      setError('This model needs a starting image — please upload one.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('model_id', model.id);
      fd.append('prompt', prompt.trim());
      fd.append('duration_seconds', String(duration));
      fd.append('aspect_ratio', aspect);
      if (image) fd.append('image', image);
      await api('/api/generations', { method: 'POST', formData: fd });
      toast('Video queued — we\'ll notify you when it\'s ready.', 'success');
      refreshUser();
      navigate('/history');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'insufficient_credits') {
        setError('INSUFFICIENT');
      } else {
        setError(err instanceof ApiError ? err.message : 'Generation failed to start. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoader />;

  if (models.length === 0) {
    return (
      <EmptyState
        title="No AI models available"
        hint="The admin hasn't enabled any generation models yet. Please check back soon."
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
          <Wand2 className="w-7 h-7 text-violet-500" /> Generate Video
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Describe your scene, pick a model, and let AI do the rest.
        </p>
      </div>

      {error === 'INSUFFICIENT' ? (
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <AlertTriangle className="w-8 h-8 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">Not enough credits</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              This video costs {cost} credits, but you have {balance}. Top up to continue creating.
            </p>
          </div>
          <Link to="/billing" className="btn-primary shrink-0">
            <Coins className="w-4 h-4" /> Buy credits
          </Link>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm px-4 py-3">
          {error}
        </div>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-6">
        {/* prompt */}
        <div className="card p-5">
          <label className="label" htmlFor="prompt">Prompt</label>
          <textarea
            id="prompt"
            className="input min-h-[140px] resize-y text-base leading-relaxed"
            placeholder="A drone shot gliding over a neon-lit cyberpunk city at night, rain reflections, cinematic…"
            maxLength={2000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <p className="text-xs text-slate-400 mt-1.5 text-right">{prompt.length}/2000</p>
        </div>

        {/* model picker */}
        <div>
          <p className="label">AI Model</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {models.map((m) => {
              const active = m.id === modelId;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => pickModel(m)}
                  className={`card p-4 text-left transition-all ${
                    active
                      ? 'ring-2 ring-violet-500 border-violet-500/50 shadow-glow'
                      : 'hover:border-violet-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          m.generation_type === 'image_to_video'
                            ? 'bg-fuchsia-500/15 text-fuchsia-500'
                            : 'bg-violet-500/15 text-violet-500'
                        }`}
                      >
                        {m.generation_type === 'image_to_video' ? (
                          <ImageIcon className="w-5 h-5" />
                        ) : (
                          <Type className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-sm">{m.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                          {m.generation_type.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <span className="badge bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
                      <Coins className="w-3 h-3" /> {m.credit_cost}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* duration + aspect */}
        {model && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card p-5">
              <p className="label">Duration</p>
              <div className="flex flex-wrap gap-2">
                {model.durations.map((d) => (
                  <button
                    type="button"
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                      duration === d
                        ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow'
                        : 'bg-slate-200/70 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <div className="card p-5">
              <p className="label">Aspect ratio</p>
              <div className="flex flex-wrap gap-2">
                {model.aspect_ratios.map((a) => (
                  <button
                    type="button"
                    key={a}
                    onClick={() => setAspect(a)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                      aspect === a
                        ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-glow'
                        : 'bg-slate-200/70 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* image upload — only for image-to-video */}
        {needsImage && (
          <div className="card p-5">
            <p className="label">
              Starting image <span className="text-red-500">*</span>
            </p>
            {preview ? (
              <div className="relative inline-block">
                <img src={preview} alt="Upload preview" className="rounded-xl max-h-56 object-contain" />
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setPreview(null);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80"
                  aria-label="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  onFile(e.dataTransfer.files?.[0]);
                }}
                className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition ${
                  dragOver
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-slate-300 dark:border-white/15 hover:border-violet-500/60'
                }`}
              >
                <ImagePlus className="w-10 h-10 text-violet-500" />
                <p className="text-sm font-semibold">Drop an image here, or tap to browse</p>
                <p className="text-xs text-slate-400">JPG, PNG or WebP · up to {MAX_MB} MB</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
        )}

        {/* cost + submit */}
        <div className="card p-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sticky bottom-20 md:static">
          <div className="flex-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This generation will use
            </p>
            <p className="text-2xl font-extrabold flex items-center gap-2">
              <Coins className="w-6 h-6 text-amber-500" /> {cost} credits
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Balance after: {Math.max(0, balance - cost)} credits
              {cantAfford && (
                <span className="text-amber-500 font-semibold"> — insufficient balance</span>
              )}
            </p>
          </div>
          <button type="submit" className="btn-primary !px-8 !py-3.5 text-base" disabled={submitting || !model}>
            <Sparkles className="w-5 h-5" />
            {submitting ? 'Queueing…' : 'Generate video'}
          </button>
        </div>
      </form>
    </div>
  );
}
