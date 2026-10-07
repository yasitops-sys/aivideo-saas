/* Typed API client for the AI Video SaaS backend.
 * Auth = httpOnly cookies (credentials: 'include').
 * CSRF double-submit: read `csrf_token` cookie -> `X-CSRF-Token` header
 * on every mutating request. Errors always arrive as { error: { code, message } }.
 */

const BASE: string =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, '')
  || (window.location.hostname === 'localhost' ? 'http://localhost:8000' : window.location.origin);

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function getCsrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiOptions {
  method?: HttpMethod;
  json?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: ApiOptions['query']): string {
  const url = new URL(path.startsWith('http') ? path : BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method || 'GET';
  const headers: Record<string, string> = {};

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData; // browser sets multipart boundary
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  if (method !== 'GET') {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      body,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('network_error', 'Could not reach the server. Check your connection.', 0);
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      err?.code || 'server_error',
      err?.message || `Request failed (${res.status})`,
      res.status,
    );
  }
  return data as T;
}

/* ---------- domain types ---------- */

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  email_verified: boolean;
  credit_balance: number;
  is_active: boolean;
  created_at: string;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  generation_type: 'text_to_video' | 'image_to_video';
  credit_cost: number;
  durations: number[];
  aspect_ratios: string[];
}

export interface Generation {
  id: string;
  prompt: string;
  generation_type: string;
  model: { id: string; name: string };
  duration_seconds: number;
  aspect_ratio: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'refunded';
  credits_reserved: number;
  credits_charged: number;
  video_url: string | null;
  thumbnail_url: string | null;
  input_image_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  currency: string;
}

export interface Payment {
  id: string;
  package: { name: string; credits: number };
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
  created_at: string;
  completed_at: string | null;
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
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface PublicSettings {
  site_name: string;
  logo_url: string | null;
  currency: string;
  registration_enabled: boolean;
  maintenance_mode: boolean;
}

export const TERMINAL_STATUSES = ['completed', 'failed', 'refunded'];
