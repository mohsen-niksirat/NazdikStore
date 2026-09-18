'use client';

/**
 * v1.4 — My orders with chat deep-links.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const STATUS_FA: Record<string, string> = {
  PENDING_ACCEPTANCE: 'در انتظار تایید',
  PREPARING: 'در حال آماده‌سازی',
  SCHEDULED: 'زمان‌بندی شده',
  IN_PROGRESS: 'در حال انجام',
  COMPLETED: 'تکمیل شده',
  DISPUTED: 'مورد اختلاف',
  CANCELLED: 'لغو شده',
};

type Order = {
  id: string;
  kind: string;
  status: string;
  totalToman: number;
  vendorProfileId: string;
};

function fmt(n: number) {
  return n.toLocaleString('fa-IR');
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await apiFetch<Order[]>('/orders/me');
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setOrders(r.data || []);
    })();
  }, []);

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">سفارش‌های من</h1>
          <p className="caption">v1.4 · لینک مستقیم چت هر سفارش</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {err && <div className="alert alert-error">{err}</div>}
      {orders.length === 0 && !err && (
        <div className="card body-muted">
          سفارشی ندارید. از{' '}
          <Link href="/cart">سبد خرید</Link> یا <Link href="/book">نوبت‌دهی</Link> شروع کنید.
        </div>
      )}

      {orders.map((o) => (
        <div key={o.id} className="list-card stack-2">
          <div className="row-between">
            <div>
              <strong className="text-sm">{o.kind}</strong>
              <div className="caption mono" dir="ltr">
                {o.id.slice(0, 16)}…
              </div>
              <div className="caption">{o.vendorProfileId}</div>
            </div>
            <div className="price">{fmt(o.totalToman)}</div>
          </div>
          <div className="flex items-center justify-between">
            <span className="tag">{STATUS_FA[o.status] || o.status}</span>
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
          </div>
        </div>
      ))}

      <Link href="/cart" className="btn-secondary">
        سبد خرید
      </Link>
    </main>
  );
}
