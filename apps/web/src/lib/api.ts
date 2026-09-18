/** Safe API helper — never throws raw fetch errors to Next overlay */
export const API_BASE = normalizeApiBase(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000',
);

function normalizeApiBase(url: string): string {
  const trimmed = (url || '').trim().replace(/\/+$/, '');
  if (!trimmed) return 'http://127.0.0.1:4000';
  // Prefer 127.0.0.1 when page is on 127.0.0.1 (avoids localhost/127 mismatch)
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === '127.0.0.1' && trimmed.includes('localhost')) {
      return trimmed.replace('localhost', '127.0.0.1');
    }
    if (host === 'localhost' && trimmed.includes('127.0.0.1')) {
      return trimmed.replace('127.0.0.1', 'localhost');
    }
  }
  return trimmed;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('nazdik_token');
}

export type SafeResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  offline: boolean;
};

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<SafeResult<T>> {
  const token = getToken();
  const base =
    typeof window !== 'undefined' ? normalizeApiBase(API_BASE) : API_BASE;
  const url = `${base}/api/v1${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error:
          body?.error?.message ||
          (res.status === 0
            ? 'ارتباط با API برقرار نشد — پورت ۴۰۰۰ را چک کنید'
            : `HTTP ${res.status}`),
        offline: false,
      };
    }
    return { ok: true, status: res.status, data: (body.data ?? body) as T, error: null, offline: false };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error:
        'ارتباط با سرور برقرار نشد. ابتدا API را بالا بیاورید: cd apps/api && npm run dev',
      offline: true,
    };
  }
}
