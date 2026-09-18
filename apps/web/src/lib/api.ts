/** Safe API helper — never throws raw fetch errors to Next overlay */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

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
  const url = `${API_BASE}/api/v1${path}`;
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
