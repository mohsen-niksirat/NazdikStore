'use client';

/**
 * Production Phase 8 — Vendor kanban, stock toggles, vacation, Sheba ledger.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

type Order = {
  id: string;
  status: string;
  totalToman: number;
  kind: string;
  vendorProfileId: string;
};

type Column = { key: string; fa: string; count: number; orders: Order[] };

type ProductRow = {
  id: string;
  title: string;
  priceToman: number;
  stock: number | null;
  inStock: boolean;
  faStock: string;
};

type Ledger = {
  grossToman: number;
  commissionToman: number;
  netToman: number;
  withdrawableToman: number;
  commissionBps: number;
  payouts: Array<{ id: string; shebaDisplay?: string; sheba: string; amountToman: number; status: string }>;
};

function fmt(n: number) {
  return (n || 0).toLocaleString('fa-IR');
}

async function ensureVendor() {
  let token = localStorage.getItem(TOKEN_KEY);
  const raw = localStorage.getItem(USER_KEY);
  const user = raw ? JSON.parse(raw) : null;
  if (!token || user?.role !== 'VENDOR') {
    const r = await apiFetch<{ tokens: { accessToken: string }; user: unknown }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ role: 'VENDOR', id: 'vendor_demo', businessName: 'آشپزخانه فروشنده' }),
    });
    if (!r.ok || !r.data) throw new Error(r.error || 'login failed');
    token = r.data.tokens.accessToken;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
  }
  return token as string;
}

export default function VendorBoardPage() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [vacation, setVacation] = useState<{ on: boolean; reason?: string }>({ on: false });
  const [sheba, setSheba] = useState('IR062960000000100324200001');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  // Client-side Sheba check (same algorithm as server)
  const shebaOk = useCallback((raw: string) => {
    const s = String(raw).toUpperCase().replace(/\s/g, '').replace(/^IR/, '').replace(/\D/g, '');
    if (!/^\d{24}$/.test(s)) return false;
    const n = s.slice(4) + s.slice(0, 4) + '1828';
    let rem = 0;
    for (let i = 0; i < n.length; i += 7) rem = Number(rem + n.slice(i, i + 7)) % 97;
    return rem === 1;
  }, []);

  const loadAll = useCallback(async () => {
    const [kanban, stock, led, vac] = await Promise.all([
      apiFetch<{ columns: Column[] }>('/vendors/me/kanban'),
      apiFetch<ProductRow[]>('/vendors/me/stock'),
      apiFetch<Ledger>('/vendors/me/ledger'),
      apiFetch<{ on: boolean; reason?: string }>('/vendors/me/vacation'),
    ]);
    if (kanban.ok && kanban.data) setColumns(kanban.data.columns || []);
    if (stock.ok && stock.data) setProducts(stock.data);
    if (led.ok && led.data) setLedger(led.data);
    if (vac.ok && vac.data) setVacation(vac.data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await ensureVendor();
        await loadAll();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setReady(true);
      }
    })();
  }, [loadAll]);

  async function advance(orderId: string) {
    setBusy(true);
    const r = await apiFetch(`/vendors/me/kanban/${orderId}/advance`, { method: 'POST' });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || 'گذار ناموفق');
      return;
    }
    setMsg('وضعیت سفارش به‌روز شد');
    void loadAll();
  }

  async function toggleStock(id: string, inStock: boolean) {
    const r = await apiFetch(`/vendors/me/stock/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ inStock: !inStock }),
    });
    if (!r.ok) setErr(r.error || 'تغییر موجودی ناموفق');
    else setMsg((r.data as { badge?: string })?.badge || 'موجودی به‌روز شد');
    void loadAll();
  }

  async function toggleVacation() {
    const r = await apiFetch('/vendors/me/vacation', {
      method: 'POST',
      body: JSON.stringify({ on: !vacation.on, reason: vacation.reason || 'تعطیل موقت' }),
    });
    if (!r.ok) setErr(r.error || 'تعطیلی ناموفق');
    else setMsg(r.data?.on ? '«تعطیل موقت» فعال شد' : 'تعطیلی برداشته شد');
    void loadAll();
  }

  async function requestPayout() {
    setErr(null);
    setMsg(null);
    if (!shebaOk(sheba)) {
      setErr('شماره شبا معتبر نیست (چک‌سامانه ISO 7064)');
      return;
    }
    setBusy(true);
    const r = await apiFetch<{ shebaDisplay: string; amountToman: number }>('/vendors/me/payouts', {
      method: 'POST',
      body: JSON.stringify({ sheba, amountToman: Number(amount) }),
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error || 'درخواست برداشت ناموفق');
      return;
    }
    setMsg(`درخواست برداشت ${fmt(r.data.amountToman)} تومان ثبت شد`);
    setAmount('');
    void loadAll();
  }

  if (!ready) {
    return (
      <main className="page page-center">
        <div className="card body-muted center">…</div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">مرکز فروشنده</h1>
          <p className="caption">فاز ۸ · کانبان · موجودی · شبا</p>
        </div>
        <Link href="/vendor" className="btn-ghost">
          پنل ساده
        </Link>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      <section className="card stack-3">
        <div className="row-between">
          <h2 className="h2">وضعیت کسب‌وکار</h2>
          <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 40 }} onClick={() => void toggleVacation()}>
            {vacation.on ? 'پایان تعطیلی' : 'تعطیل موقت'}
          </button>
        </div>
        {vacation.on && (
          <div className="alert alert-muted">{vacation.reason || 'تعطیل موقت فعال است'}</div>
        )}
        <Link href="/map" className="btn-secondary">
          نمایش روی نقشه نزدیک
        </Link>
      </section>

      <section className="card stack-3">
        <h2 className="h2">تخته سفارش (کانبان)</h2>
        {columns.length === 0 && <p className="body-muted">سفارشی نیست — از سمت مشتری سفارش ثبت کنید.</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          {columns.map((col) => (
            <div key={col.key} className="list-card stack-2">
              <div className="row-between">
                <strong className="text-sm">
                  {col.fa} <span className="tag">{col.count}</span>
                </strong>
              </div>
              {col.orders.length === 0 && <span className="caption">—</span>}
              {col.orders.map((o) => (
                <div key={o.id} className="row-between" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                  <div>
                    <div className="mono caption" dir="ltr">
                      {o.id.slice(0, 12)}…
                    </div>
                    <div className="price">{fmt(o.totalToman)}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ width: 'auto', minHeight: 36, padding: '0 12px' }}
                    disabled={busy}
                    onClick={() => void advance(o.id)}
                  >
                    گام بعد
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="card stack-3">
        <h2 className="h2">موجودی منو</h2>
        {products.length === 0 && <p className="body-muted">محصولی ثبت نشده است.</p>}
        {products.map((p) => (
          <div key={p.id} className="row-between">
            <div>
              <strong className="text-sm">{p.title}</strong>
              <div className="caption">{p.faStock}</div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', minHeight: 40 }}
              onClick={() => void toggleStock(p.id, p.inStock)}
            >
              {p.inStock ? 'تمام شد' : 'موجود شد'}
            </button>
          </div>
        ))}
      </section>

      <section className="card stack-3">
        <h2 className="h2">صورت مالی</h2>
        {ledger ? (
          <>
            <div className="row-between text-sm">
              <span>فروش ناخالص</span>
              <span>{fmt(ledger.grossToman)}</span>
            </div>
            <div className="row-between text-sm">
              <span>کمیسیون پلتفرم ({ledger.commissionBps / 100}%)</span>
              <span className="text-danger">{fmt(ledger.commissionToman)}</span>
            </div>
            <div className="row-between">
              <span>قابل برداشت</span>
              <span className="price">{fmt(ledger.withdrawableToman)} تومان</span>
            </div>
            <div className="field">
              <label>شماره شبا (IR + ۲۴ رقم)</label>
              <input
                className="input-field mono"
                dir="ltr"
                value={sheba}
                onChange={(e) => setSheba(e.target.value)}
                style={{
                  borderColor: sheba && !shebaOk(sheba) ? 'var(--danger)' : undefined,
                }}
              />
              {sheba && !shebaOk(sheba) && (
                <span className="caption text-danger">شبا نامعتبر است</span>
              )}
            </div>
            <div className="field">
              <label>مبلغ برداشت (تومان)</label>
              <input className="input-field" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !shebaOk(sheba) || !Number(amount)}
              onClick={() => void requestPayout()}
            >
              ثبت درخواست برداشت
            </button>
            {ledger.payouts?.length > 0 && (
              <div className="stack-2">
                <strong className="text-sm">درخواست‌ها</strong>
                {ledger.payouts.map((p) => (
                  <div key={p.id} className="caption">
                    {p.shebaDisplay || p.sheba} — {fmt(p.amountToman)} — {p.status}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="body-muted">در دسترس نیست</p>
        )}
      </section>
    </main>
  );
}
