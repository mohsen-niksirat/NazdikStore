'use client';

/**
 * Phase 6 — Vendor dashboard
 * Dev login (no SMS) → manage products, posts, location privacy, orders.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

type Tab = 'products' | 'posts' | 'orders' | 'settings';

const STATUS_FA: Record<string, string> = {
  PENDING_ACCEPTANCE: 'در انتظار تایید',
  PREPARING: 'در حال آماده‌سازی',
  SCHEDULED: 'زمان‌بندی شده',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'تکمیل شده',
  DISPUTED: 'مورد اختلاف',
  CANCELLED: 'لغو شده',
};

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

async function api(path: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok && body.success !== false, body, status: res.status };
}

export default function VendorDashboardPage() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [tab, setTab] = useState<Tab>('products');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [products, setProducts] = useState<Array<{ id: string; title: string; priceToman: number; stock: number | null }>>([]);
  const [posts, setPosts] = useState<Array<{ id: string; caption: string }>>([]);
  const [orders, setOrders] = useState<Array<{ id: string; status: string; totalToman: number; kind: string }>>([]);

  const [prodTitle, setProdTitle] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [postCaption, setPostCaption] = useState('');
  const [isHomeBased, setIsHomeBased] = useState(true);
  const [lat, setLat] = useState('35.692');
  const [lng, setLng] = useState('51.392');

  const refresh = useCallback(async () => {
    setErr(null);
    const prods = await api('/vendors/me/products');
    if (prods.ok) {
      setProducts(prods.body.data || []);
      if (prods.body.vendorProfileId) {
        try {
          const prof = await api(`/vendors/${prods.body.vendorProfileId}/profile`);
          if (prof.ok) setPosts(prof.body.data?.posts || []);
        } catch {
          /* ignore */
        }
      }
    }
    const ords = await api('/orders/vendor/me');
    if (ords.ok) setOrders(ords.body.data || []);
  }, []);

  useEffect(() => {
    const rawUser = typeof window !== 'undefined' ? localStorage.getItem(USER_KEY) : null;
    const token = getToken();
    if (rawUser && token) {
      try {
        setUser(JSON.parse(rawUser));
      } catch {
        setUser(null);
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (user?.role === 'VENDOR') void refresh();
  }, [user, refresh]);

  async function devLogin() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/api/v1/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'VENDOR',
          id: 'vendor_demo',
          businessName: 'آشپزخانه فروشنده',
          vendorType: 'FOOD',
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setErr(body.error?.message || 'ورود دمو ناموفق بود');
        return;
      }
      localStorage.setItem(TOKEN_KEY, body.data.tokens.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(body.data.user));
      setUser(body.data.user);
      setMsg('ورود دمو موفق — پنل فروشنده فعال شد');
      setTimeout(() => void refresh(), 100);
    } catch (e) {
      setErr('API در دسترس نیست: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setProducts([]);
    setOrders([]);
    setPosts([]);
  }

  async function addProduct() {
    if (!prodTitle.trim()) return;
    setBusy(true);
    const r = await api('/vendors/me/products', {
      method: 'POST',
      body: JSON.stringify({
        title: prodTitle,
        priceToman: Number(prodPrice) || 0,
        stock: prodStock === '' ? null : Number(prodStock),
      }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.body.error?.message || 'خطا در افزودن محصول');
      return;
    }
    setProdTitle('');
    setProdPrice('');
    setProdStock('');
    setMsg('محصول اضافه شد');
    void refresh();
  }

  async function addPost() {
    if (!postCaption.trim()) return;
    setBusy(true);
    const r = await api('/vendors/me/posts', {
      method: 'POST',
      body: JSON.stringify({ caption: postCaption }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.body.error?.message || 'خطا در انتشار پست');
      return;
    }
    setPostCaption('');
    setMsg('پست منتشر شد');
    void refresh();
  }

  async function saveLocation() {
    setBusy(true);
    const r = await api('/vendors/me/location', {
      method: 'POST',
      body: JSON.stringify({
        lat: Number(lat),
        lng: Number(lng),
        isHomeBased,
        vendorType: 'FOOD',
        address: isHomeBased ? 'محدوده' : 'فروشگاه',
      }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.body.error?.message || 'خطا در ذخیره موقعیت');
      return;
    }
    setMsg(
      isHomeBased
        ? 'موقعیت خانگی ذخیره شد — مختصات دقیق در نقشه مخفی می‌ماند (۲۰۰م مبهم).'
        : 'پین عمومی ذخیره شد.',
    );
  }

  async function transition(orderId: string, status: string) {
    setBusy(true);
    const r = await api(`/orders/${orderId}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.body.error?.message || `تغییر وضعیت ناموفق (${status})`);
      return;
    }
    setMsg(`سفارش → ${STATUS_FA[status] || status}`);
    void refresh();
  }

  if (!ready) {
    return (
      <main className="page page-center">
        <div className="card center body-muted">…</div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">پنل فروشنده</h1>
          <p className="caption">فاز ۶ · مدیریت محصول، پست و سفارش</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {!user || user.role !== 'VENDOR' ? (
        <section className="card card-hero stack-4">
          <div>
            <h2 className="h2">ورود دمو فروشنده</h2>
            <p className="body-muted mt-2">
              بدون پیامک — برای تست پنل. توکن در مرورگر ذخیره می‌شود.
            </p>
          </div>
          {err && <div className="alert alert-error">{err}</div>}
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void devLogin()}>
            {busy ? <Loader2 style={{ width: 16, height: 16 }} aria-hidden /> : null}
            ورود به عنوان فروشنده دمو
          </button>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="caption">کاربر: {user.id}</span>
            <button type="button" className="btn-ghost" onClick={logout}>
              خروج
            </button>
          </div>

          {msg && <div className="alert alert-ok">{msg}</div>}
          {err && <div className="alert alert-error">{err}</div>}

          <div className="tabs" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            {(
              [
                ['products', 'محصولات'],
                ['posts', 'پست‌ها'],
                ['orders', 'سفارش‌ها'],
                ['settings', 'تنظیمات'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`tab${tab === k ? ' active' : ''}`}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'products' && (
            <section className="stack-3">
              <div className="card stack-3">
                <h2 className="h2">افزودن محصول</h2>
                <div className="field">
                  <label>عنوان</label>
                  <input className="input-field" value={prodTitle} onChange={(e) => setProdTitle(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="field">
                    <label>قیمت (تومان)</label>
                    <input className="input-field" dir="ltr" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>موجودی</label>
                    <input className="input-field" dir="ltr" value={prodStock} onChange={(e) => setProdStock(e.target.value)} />
                  </div>
                </div>
                <button type="button" className="btn-primary" disabled={busy || !prodTitle.trim()} onClick={() => void addProduct()}>
                  ثبت محصول
                </button>
              </div>
              <div>
                {products.length === 0 && <div className="card body-muted">محصولی ثبت نشده است.</div>}
                {products.map((p) => (
                  <div key={p.id} className="list-card row-between">
                    <div>
                      <strong>{p.title}</strong>
                      <div className="caption">موجودی: {p.stock ?? '—'}</div>
                    </div>
                    <span className="price">{p.priceToman.toLocaleString('fa-IR')}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === 'posts' && (
            <section className="stack-3">
              <div className="card stack-3">
                <h2 className="h2">پست جدید</h2>
                <div className="field">
                  <label>متن</label>
                  <textarea
                    className="input-field"
                    style={{ minHeight: 90, paddingTop: 10, resize: 'vertical' }}
                    value={postCaption}
                    onChange={(e) => setPostCaption(e.target.value)}
                  />
                </div>
                <button type="button" className="btn-primary" disabled={busy || !postCaption.trim()} onClick={() => void addPost()}>
                  انتشار
                </button>
              </div>
              {posts.map((p) => (
                <div key={p.id} className="list-card">
                  <p className="text-sm">{p.caption}</p>
                </div>
              ))}
            </section>
          )}

          {tab === 'orders' && (
            <section className="stack-3">
              {orders.length === 0 && (
                <div className="card body-muted">
                  سفارشی نیست. از فاز ۷ مشتری می‌تواند سفارش دهد.
                </div>
              )}
              {orders.map((o) => (
                <div key={o.id} className="list-card stack-2">
                  <div className="row-between">
                    <div>
                      <strong className="mono" style={{ fontSize: 12 }}>
                        {o.id.slice(0, 14)}…
                      </strong>
                      <div className="caption">{o.kind}</div>
                    </div>
                    <div className="price">{o.totalToman.toLocaleString('fa-IR')} تومان</div>
                  </div>
                  <div className="tag">{STATUS_FA[o.status] || o.status}</div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/messages?order=${encodeURIComponent(o.id)}`}
                      className="btn-secondary"
                      style={{ width: 'auto', minHeight: 40, padding: '0 14px' }}
                    >
                      چت سفارش
                    </Link>
                    {o.status === 'PENDING_ACCEPTANCE' && (
                      <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 40 }} onClick={() => void transition(o.id, 'PREPARING')}>
                        تایید سفارش
                      </button>
                    )}
                    {o.status === 'PREPARING' && (
                      <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 40 }} onClick={() => void transition(o.id, 'IN_PROGRESS')}>
                        شروع انجام
                      </button>
                    )}
                    {o.status === 'IN_PROGRESS' && (
                      <button type="button" className="btn-primary" style={{ width: 'auto', minHeight: 40 }} onClick={() => void transition(o.id, 'COMPLETED')}>
                        تکمیل
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          {tab === 'settings' && (
            <section className="card stack-3">
              <h2 className="h2">موقعیت و حریم خصوصی</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isHomeBased}
                  onChange={(e) => setIsHomeBased(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                کسب‌وکار خانگی — مختصات در نقشه مبهم شود
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="field">
                  <label>عرض جغرافیایی</label>
                  <input className="input-field" dir="ltr" value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div className="field">
                  <label>طول جغرافیایی</label>
                  <input className="input-field" dir="ltr" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
              </div>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void saveLocation()}>
                ذخیره موقعیت
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
