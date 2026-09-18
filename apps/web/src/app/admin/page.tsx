'use client';

/**
 * v1.5 — Admin console with live API data.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

type Order = {
  id: string;
  kind: string;
  status: string;
  totalToman: number;
  vendorProfileId: string;
  consumerId: string;
};

type Overview = {
  platformBalanceToman: number;
  settlements: Array<{ vendorProfileId: string; grossToman: number; commissionToman: number; netToman: number }>;
  orders: Order[];
  orderCount: number;
  pendingCount: number;
  disputedCount: number;
};

const STATUS_FA: Record<string, string> = {
  PENDING_ACCEPTANCE: 'در انتظار تایید',
  PREPARING: 'آماده‌سازی',
  SCHEDULED: 'زمان‌بندی',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'تکمیل',
  DISPUTED: 'اختلاف',
  CANCELLED: 'لغو',
};

function fmt(n: number) {
  return (n || 0).toLocaleString('fa-IR');
}

export default function AdminPage() {
  const [user, setUser] = useState<{ id: string; role: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await apiFetch<Overview>('/admin/overview');
    if (!r.ok) {
      setErr(r.error || 'بارگذاری کنسول ناموفق');
      return;
    }
    setOverview(r.data);
    setErr(null);
  }, []);

  useEffect(() => {
    const u = localStorage.getItem(USER_KEY);
    if (u) {
      try {
        const parsed = JSON.parse(u);
        setUser(parsed);
        if (parsed.role === 'ADMIN') void load();
      } catch {
        /* ignore */
      }
    }
  }, [load]);

  async function loginAdmin() {
    setErr(null);
    const r = await apiFetch<{ user: { id: string; role: string }; tokens: { accessToken: string } }>(
      '/auth/dev-login',
      { method: 'POST', body: JSON.stringify({ role: 'ADMIN', id: 'admin_demo' }) },
    );
    if (!r.ok || !r.data) {
      setErr(r.error || 'ورود ادمین ناموفق — API بالا باشد');
      return;
    }
    localStorage.setItem(TOKEN_KEY, r.data.tokens.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
    setUser(r.data.user);
    setMsg('ادمین وارد شد');
    void load();
  }

  async function transition(orderId: string, status: string) {
    setBusy(true);
    const r = await apiFetch(`/admin/orders/${orderId}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || 'تغییر وضعیت ناموفق');
      return;
    }
    setMsg(`سفارش → ${STATUS_FA[status] || status}`);
    void load();
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">کنسول ادمین</h1>
          <p className="caption">v1.5 · داده زنده از API</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {user?.role !== 'ADMIN' ? (
        <section className="card card-hero stack-3">
          <p className="body-muted">برای مشاهده آمار و سفارش‌ها، ورود ادمین دمو بزنید.</p>
          <button type="button" className="btn-primary" onClick={() => void loginAdmin()}>
            ورود ادمین دمو
          </button>
        </section>
      ) : (
        <>
          {overview && (
            <>
              <section className="card stack-2">
                <h2 className="h2">خلاصه پلتفرم</h2>
                <div className="row-between">
                  <span>کیف پول پلتفرم</span>
                  <span className="price">{fmt(overview.platformBalanceToman)} تومان</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="tag">سفارش‌ها: {overview.orderCount}</span>
                  <span className="tag tag-gold">در انتظار: {overview.pendingCount}</span>
                  <span className="tag" style={{ background: 'rgba(180,35,24,.1)', color: 'var(--danger)' }}>
                    اختلاف: {overview.disputedCount}
                  </span>
                </div>
              </section>

              <section className="stack-3">
                <h2 className="h2">سفارش‌ها</h2>
                {overview.orders.length === 0 && (
                  <div className="card body-muted">سفارشی در حافظه دمو نیست — از /cart سفارش ثبت کنید.</div>
                )}
                {overview.orders.map((o) => (
                  <div key={o.id} className="list-card stack-2">
                    <div className="row-between">
                      <div>
                        <strong className="text-sm">{o.kind}</strong>
                        <div className="caption mono" dir="ltr">
                          {o.id.slice(0, 14)}…
                        </div>
                        <div className="caption">{o.vendorProfileId}</div>
                      </div>
                      <div className="price">{fmt(o.totalToman)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tag">{STATUS_FA[o.status] || o.status}</span>
                      {o.status === 'PENDING_ACCEPTANCE' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ width: 'auto', minHeight: 36, padding: '0 12px' }}
                          disabled={busy}
                          onClick={() => void transition(o.id, 'PREPARING')}
                        >
                          تایید
                        </button>
                      )}
                      {o.status === 'IN_PROGRESS' && (
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ width: 'auto', minHeight: 36, padding: '0 12px' }}
                          disabled={busy}
                          onClick={() => void transition(o.id, 'COMPLETED')}
                        >
                          تکمیل
                        </button>
                      )}
                      {o.status !== 'CANCELLED' && o.status !== 'COMPLETED' && (
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() => void transition(o.id, 'CANCELLED')}
                        >
                          لغو
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </section>

              <section className="card stack-2">
                <h2 className="h2">تسویه فروشندگان</h2>
                {overview.settlements.length === 0 && <p className="caption">هنوز تسویه‌ای ثبت نشده است.</p>}
                {overview.settlements.map((s, i) => (
                  <div key={i} className="row-between text-sm">
                    <span>{s.vendorProfileId}</span>
                    <span className="price">
                      {fmt(s.netToman)} <span className="caption">(کمیسیون {fmt(s.commissionToman)})</span>
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}

          <Link href="/orders" className="btn-secondary">
            سفارش‌های مشتری
          </Link>
        </>
      )}
    </main>
  );
}
