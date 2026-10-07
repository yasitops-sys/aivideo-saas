/**
 * Admin API client.
 * - Base URL from VITE_API_URL (default http://localhost:8000), credentials:"include" always.
 * - CSRF double-submit: reads `csrf_token` cookie, sends X-CSRF-Token on mutations.
 * - Errors: { error: { code, message } }. 403 -> "Access denied — admin role required".
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getCsrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function toQuery(q?: Query): string {
  if (!q) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (mutating) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(`${API_BASE}${path}${toQuery(query)}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    let message = err?.message || `Request failed (${res.status})`;
    const code = err?.code || 'server_error';
    if (res.status === 403) message = 'Access denied — admin role required';
    if (res.status === 401) message = 'Session expired. Please log in again.';
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/* ---------------- types ---------------- */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  credit_balance: number;
  created_at: string;
}

export interface UserDetail {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
  credit_balance: number;
  totals: { purchased: number; used: number; generations: number; payments: number };
  recent_generations: Generation[];
  recent_payments: Payment[];
  created_at: string;
}

export interface Generation {
  id: string;
  prompt: string;
  generation_type: string;
  model: { id: string; name: string };
  user?: { id: string; email: string };
  user_email?: string;
  duration_seconds: number;
  aspect_ratio: string;
  status: string;
  credits_reserved: number;
  credits_charged: number;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Payment {
  id: string;
  user_email?: string;
  user?: { id: string; email: string };
  package?: { name: string; credits: number };
  package_name?: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
  created_at: string;
  completed_at: string | null;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface AiModel {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  generation_type: string;
  credit_cost: number;
  durations: number[];
  aspect_ratios: string[];
  is_enabled: boolean;
  created_at: string;
}

export interface CreditTransaction {
  id: string;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_id: string | null;
  description: string;
  created_at: string;
  user_email?: string;
}

export interface AuditLog {
  id: string;
  admin_email: string | null;
  admin?: { email: string };
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: unknown; // JSON string or already-parsed object
  ip_address: string | null;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
  updated_at?: string;
}

export interface DashboardData {
  totals: {
    users: number;
    active_users: number;
    payments: number;
    revenue_cents: number;
    credits_sold: number;
    credits_consumed: number;
    videos_generated: number;
    failed_generations: number;
  };
  recent_users: AdminUser[];
  recent_payments: Payment[];
  recent_generations: Generation[];
  charts: {
    signups_by_day: { date: string; count: number }[];
    revenue_by_day: { date: string; cents: number }[];
    // backend may send an array or a {status: count} map
    generations_by_status: { status: string; count: number }[] | Record<string, number>;
  };
}

export interface Me {
  id: string;
  email: string;
  full_name: string;
  role: string;
  email_verified: boolean;
  credit_balance: number;
  is_active: boolean;
  created_at: string;
}
