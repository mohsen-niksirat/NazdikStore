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
  const [metrics, setMetrics] = useState<{
    gmvToman: number;
    orderCount: number;
    takeRate: number;
    aovToman: number;
    commissionToman: number;
    series: Array<{ t: string; orders: number; gmv: number }>;
  } | null>(null);
  const [fraud, setFraud] = useState<Array<{ key: string; badge?: string; score?: number }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kycVp, setKycVp] = useState('vp_food_1');

  const load = useCallback(async () => {
    const r = await apiFetch<Overview>('/admin/overview');
    if (r.ok && r.data) {
      setOverview(r.data);
      setErr(null);
    } else if (r.error) {
      setErr(r.error);
    }
    const m = await apiFetch<{
      gmvToman: number;
      orderCount: number;
      takeRate: number;
      aovToman: number;
      commissionToman: number;
      series: Array<{ t: string; orders: number; gmv: number }>;
    }>('/admin/metrics');
    if (m.ok && m.data) setMetrics(m.data);
    const f = await apiFetch<Array<{ key: string; badge?: string; score?: number }>>('/admin/fraud');
    if (f.ok && f.data) setFraud(f.data);
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
          {metrics && (
            <section className="card stack-2">
              <h2 className="h2">شاخص‌های بازار (BI)</h2>
              <div className="row-between text-sm">
                <span>GMV</span>
                <span className="price">{fmt(metrics.gmvToman)}</span>
              </div>
              <div className="row-between text-sm">
                <span>Take rate</span>
                <span>{(metrics.takeRate * 100).toFixed(1)}%</span>
              </div>
              <div className="row-between text-sm">
                <span>AOV</span>
                <span>{fmt(metrics.aovToman)}</span>
              </div>
              <div className="row-between text-sm">
                <span>کمیسیون</span>
                <span>{fmt(metrics.commissionToman)}</span>
              </div>
              {metrics.series?.length > 0 && (
                <div className="caption">
                  سری: {metrics.series.map((s) => `${s.t}: ${s.orders}`).join(' · ')}
                </div>
              )}
            </section>
          )}

          {fraud.length > 0 && (
            <section className="card stack-2">
              <h2 className="h2">هشدار تقلب</h2>
              {fraud.map((f) => (
                <div key={f.key} className="row-between text-sm">
                  <span className="mono caption" dir="ltr">
                    {f.key}
                  </span>
                  <span className="tag" style={{ background: 'rgba(180,35,24,.12)', color: 'var(--danger)' }}>
                    {f.badge || 'FLAG'}
                  </span>
                </div>
              ))}
            </section>
          )}

          <section className="card stack-3">
            <h2 className="h2">KYC فروشندگان</h2>
            <div className="field">
              <label>شناسه پروفایل فروشنده</label>
              <input
                className="input-field mono"
                dir="ltr"
                placeholder="vp_food_1"
                value={kycVp}
                onChange={(e) => setKycVp(e.target.value)}
              />
            </div>
            <div className="radius-row">
              <button
                type="button"
                className="btn-secondary"
                style={{ width: 'auto', minHeight: 40 }}
                onClick={async () => {
                  const r = await apiFetch(`/admin/kyc/${kycVp}`, {
                    method: 'POST',
                    body: JSON.stringify({ status: 'APPROVED', license: 'جواز-نمونه' }),
                  });
                  setMsg(r.ok ? `${kycVp} تایید KYC شد` : r.error || 'خطا');
                }}
              >
                تایید مدارک
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={async () => {
                  const r = await apiFetch(`/admin/kyc/${kycVp}`, {
                    method: 'POST',
                    body: JSON.stringify({ status: 'REJECTED', reason: 'مدرک ناخوانا' }),
                  });
                  setMsg(r.ok ? `${kycVp} رد شد` : r.error || 'خطا');
                }}
              >
                رد
              </button>
            </div>
          </section>

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
