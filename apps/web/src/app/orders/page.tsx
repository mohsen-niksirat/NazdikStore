'use client';

/**
 * P19 — Consumer order command center.
 * Actions: pay, chat, track, dispute, receipt
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

type Order = {
  id: string;
  kind: string;
  status: string;
  totalToman: number;
  vendorProfileId: string;
  createdAt?: string;
  lines?: Array<{ title: string; quantity: number; unitPriceToman: number }>;
};

type Receipt = {
  orderId: string;
  brand: string;
  totalToman: number;
  lines: Array<{ title: string; quantity: number; unitPriceToman: number }>;
  deliveryAddress: string | null;
  status: string;
  kind: string;
};

const STATUS_FA: Record<string, string> = {
  PENDING_ACCEPTANCE: 'در انتظار تایید',
  PREPARING: 'آماده‌سازی',
  SCHEDULED: 'زمان‌بندی',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'تکمیل شده',
  DISPUTED: 'مورد اختلاف',
  CANCELLED: 'لغو شده',
};

function fmt(n: number) {
  return (n || 0).toLocaleString('fa-IR');
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [busy, setBusy] = useState(false);

  const ensureLogin = useCallback(async () => {
    let token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    const user = raw ? JSON.parse(raw) : null;
    if (!token || user?.role === 'VENDOR') {
      const r = await apiFetch<{ tokens: { accessToken: string }; user: unknown }>(
        '/auth/dev-login',
        { method: 'POST', body: JSON.stringify({ role: 'CONSUMER', id: 'consumer_demo' }) },
      );
      if (r.ok && r.data) {
        token = r.data.tokens.accessToken;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
      }
    }
    return token;
  }, []);

  const load = useCallback(async () => {
    await ensureLogin();
    const r = await apiFetch<Order[]>('/orders/me');
    if (!r.ok) {
      setErr(r.error || 'بارگذاری سفارش‌ها ناموفق');
      return;
    }
    setOrders(r.data || []);
    setErr(null);
  }, [ensureLogin]);

  useEffect(() => {
    void load();
  }, [load]);

  const pay = useCallback(
    async (orderId: string) => {
      setBusy(true);
      setMsg(null);
      setErr(null);
      const payR = await apiFetch<{ id: string }>(`/orders/${orderId}/pay`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `pay_${orderId}_p19` },
      });
      if (!payR.ok || !payR.data) {
        setErr(payR.error || 'پرداخت ناموفق');
        setBusy(false);
        return;
      }
      const sim = await apiFetch<{ vendorCredit: number }>(
        `/payments/simulate/${payR.data.id}`,
        { method: 'POST' },
      );
      if (sim.ok && sim.data) {
        setMsg(`پرداخت سفارش موفق — سهم فروشنده ${fmt(sim.data.vendorCredit)} تومان`);
      } else {
        setMsg('پرداخت ایجاد شد');
      }
      setBusy(false);
      void load();
    },
    [load],
  );

  const openReceipt = useCallback(async (orderId: string) => {
    setErr(null);
    const r = await apiFetch<Receipt>(`/orders/${orderId}/receipt`);
    if (!r.ok || !r.data) {
      setErr(r.error || 'رسید در دسترس نیست');
      return;
    }
    setReceipt(r.data);
  }, []);

  const submitDispute = useCallback(async () => {
    if (!disputeFor) return;
    setBusy(true);
    const r = await apiFetch<{ status: string }>(`/orders/${disputeFor}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ reason: disputeReason }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error || 'ثبت اختلاف ناموفق');
      return;
    }
    setMsg('اختلاف ثبت شد و به ادمین ارجاع داده شد');
    setDisputeFor(null);
    setDisputeReason('');
    void load();
  }, [disputeFor, disputeReason, load]);

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">سفارش‌های من</h1>
          <p className="caption">P19 · مرکز فرمان سفارش</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      {orders.length === 0 && !err && (
        <EmptyState
          title="هنوز سفارشی ندارید"
          body="از سبد خرید یا نوبت‌دهی شروع کنید — بعداً همه چیز را اینجا می‌بینید."
          actionHref="/cart"
          actionLabel="رفتن به سبد خرید"
        />
      )}

      {orders.map((o) => (
        <div key={o.id} className="list-card stack-2">
          <div className="row-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <span className="tag">{STATUS_FA[o.status] || o.status}</span>
                <span className="tag tag-line">{o.kind}</span>
              </div>
              <div className="caption mono mt-1" dir="ltr">
                {o.id.slice(0, 16)}…
              </div>
              <div className="caption">{o.vendorProfileId}</div>
            </div>
            <div className="price">{fmt(o.totalToman)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              style={{ width: 'auto', minHeight: 40, padding: '0 14px' }}
              disabled={busy || o.status === 'COMPLETED' || o.status === 'CANCELLED'}
              onClick={() => void pay(o.id)}
            >
              پرداخت
            </button>
            <Link
              href={`/messages?order=${encodeURIComponent(o.id)}`}
              className="btn-secondary"
              style={{ width: 'auto', minHeight: 40, padding: '0 14px' }}
            >
              چت
            </Link>
            <Link
              href={`/track?order=${encodeURIComponent(o.id)}`}
              className="btn-secondary"
              style={{ width: 'auto', minHeight: 40, padding: '0 14px' }}
            >
              رهگیری
            </Link>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', minHeight: 40, padding: '0 14px' }}
              onClick={() => void openReceipt(o.id)}
            >
              رسید
            </button>
            {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && o.status !== 'DISPUTED' && (
              <button type="button" className="btn-ghost" onClick={() => setDisputeFor(o.id)}>
                اختلاف
              </button>
            )}
          </div>
        </div>
      ))}

      {disputeFor && (
        <section className="card stack-3">
          <h2 className="h2">ثبت اختلاف سفارش</h2>
          <div className="field">
            <label>دلیل</label>
            <textarea
              className="input-field"
              style={{ minHeight: 80, paddingTop: 10 }}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="مثلاً کالا ناقص رسید"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void submitDispute()}>
              ثبت اختلاف
            </button>
            <button type="button" className="btn-secondary" onClick={() => setDisputeFor(null)}>
              انصراف
            </button>
          </div>
        </section>
      )}

      {receipt && (
        <section className="card stack-2">
          <h2 className="h2">رسید {receipt.brand}</h2>
          <div className="caption mono" dir="ltr">
            {receipt.orderId}
          </div>
          <div className="text-sm">
            {receipt.kind} · {STATUS_FA[receipt.status] || receipt.status}
          </div>
          {(receipt.lines || []).map((l, i) => (
            <div key={i} className="row-between text-sm">
              <span>
                {l.title} × {l.quantity}
              </span>
              <span>{fmt(l.unitPriceToman * l.quantity)}</span>
            </div>
          ))}
          <div className="row-between">
            <strong>جمع</strong>
            <strong className="price">{fmt(receipt.totalToman)}</strong>
          </div>
          {receipt.deliveryAddress && (
            <div className="caption">آدرس: {receipt.deliveryAddress}</div>
          )}
          <button type="button" className="btn-secondary" onClick={() => setReceipt(null)}>
            بستن رسید
          </button>
        </section>
      )}
    </main>
  );
}
