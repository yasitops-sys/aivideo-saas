/** Hand-rolled SVG charts — no chart library dependency. */
import { formatDate, formatMoney } from '../lib/format';

/* ---------- 30-day bar chart ---------- */
export function BarChart({ data, color = '#6366f1' }: { data: { date: string; count: number }[]; color?: string }) {
  const W = 720;
  const H = 180;
  const PAD = 8;
  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length;
  const bw = (W - PAD * 2) / n;
  const barW = Math.max(2, bw * 0.62);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Signups bar chart">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={H - PAD - f * (H - PAD * 2)}
            y2={H - PAD - f * (H - PAD * 2)}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
        ))}
        {data.map((d, i) => {
          const h = (d.count / max) * (H - PAD * 2 - 18);
          const x = PAD + i * bw + (bw - barW) / 2;
          const y = H - PAD - h;
          return (
            <g key={d.date}>
              <rect x={x} y={y} width={barW} height={Math.max(h, 1)} rx={2} fill={color} opacity={d.count ? 0.9 : 0.25}>
                <title>{`${d.date}: ${d.count}`}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{data.length ? formatDate(data[0].date) : ''}</span>
        <span>max/day: {max}</span>
        <span>{data.length ? formatDate(data[data.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

/* ---------- 30-day revenue area chart ---------- */
export function AreaChart({ data, color = '#10b981' }: { data: { date: string; cents: number }[]; color?: string }) {
  const W = 720;
  const H = 180;
  const PAD = 8;
  const max = Math.max(1, ...data.map((d) => d.cents));
  const n = Math.max(1, data.length);
  const px = (i: number) => PAD + (i / Math.max(1, n - 1)) * (W - PAD * 2);
  const py = (v: number) => H - PAD - (v / max) * (H - PAD * 2 - 18);

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(d.cents).toFixed(1)}`).join(' ');
  const area = `${line} L${px(n - 1).toFixed(1)},${H - PAD} L${px(0).toFixed(1)},${H - PAD} Z`;
  const gid = 'revArea';

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Revenue area chart">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={H - PAD - f * (H - PAD * 2 - 18)}
            y2={H - PAD - f * (H - PAD * 2 - 18)}
            stroke="currentColor"
            strokeOpacity={0.08}
          />
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
        {data.map((d, i) => (
          <circle key={d.date} cx={px(i)} cy={py(d.cents)} r={2.5} fill={color}>
            <title>{`${d.date}: ${formatMoney(d.cents)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{data.length ? formatDate(data[0].date) : ''}</span>
        <span>total: {formatMoney(data.reduce((s, d) => s + d.cents, 0))}</span>
        <span>{data.length ? formatDate(data[data.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

/* ---------- status donut ---------- */
const STATUS_COLORS: Record<string, string> = {
  queued: '#38bdf8',
  processing: '#6366f1',
  completed: '#10b981',
  failed: '#ef4444',
  refunded: '#f59e0b',
};

export function DonutChart({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 25; // start at top

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 140 140" className="h-36 w-36" role="img" aria-label="Generations by status">
        <circle cx="70" cy="70" r={R} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={20} />
        {data.map((d) => {
          const frac = total ? d.count / total : 0;
          const dash = `${(frac * C).toFixed(1)} ${(C - frac * C).toFixed(1)}`;
          const el = (
            <circle
              key={d.status}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={STATUS_COLORS[d.status] ?? '#94a3b8'}
              strokeWidth={20}
              strokeDasharray={dash}
              strokeDashoffset={(-offset * C) / 100}
            >
              <title>{`${d.status}: ${d.count}`}</title>
            </circle>
          );
          offset += frac * 100;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" className="fill-slate-900 dark:fill-white" fontSize="22" fontWeight="800">
          {total}
        </text>
        <text x="70" y="84" textAnchor="middle" className="fill-slate-500" fontSize="10">
          total
        </text>
      </svg>
      <ul className="space-y-2">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-sm" style={{ background: STATUS_COLORS[d.status] ?? '#94a3b8' }} />
            <span className="font-medium capitalize text-slate-700 dark:text-slate-200">{d.status}</span>
            <span className="text-slate-500 dark:text-slate-400">{d.count}</span>
          </li>
        ))}
        {data.length === 0 && <li className="text-sm text-slate-500">No generations yet.</li>}
      </ul>
    </div>
  );
}
