'use client';

/**
 * v1.3 — RFQ quote inbox: list quotes on a job, accept winner, pay.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

type Quote = {
  id: string;
  jobRequestId: string;
  vendorProfileId: string;
  priceToman: number;
  etaHours: number;
  message: string | null;
  status: string;
};

const STATUS_FA: Record<string, string> = {
  PENDING: 'در انتظار',
  ACCEPTED: 'پذیرفته شده',
  REJECTED: 'رد شده',
  WITHDRAWN: 'لغو شده',
};

function fmt(n: number) {
  return n.toLocaleString('fa-IR');
}

export default function RfqQuotesPage() {
  const [jobId, setJobId] = useState('');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  useEffect(() => {
    // Prefer last created job from sessionStorage
    const last = sessionStorage.getItem('nazdik_job_id');
    if (last) setJobId(last);
  }, []);

  const loadQuotes = useCallback(async () => {
    if (!jobId.trim()) return;
    setErr(null);
    const r = await apiFetch<Quote[]>(`/jobs/${jobId}/quotes`);
    if (!r.ok) {
      setErr(r.error || 'بارگذاری پیشنهادها ناموفق');
      setQuotes([]);
      return;
    }
    setQuotes(r.data || []);
  }, [jobId]);

  useEffect(() => {
    if (jobId) void loadQuotes();
  }, [jobId, loadQuotes]);

  async function ensureConsumer() {
    let token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    const user = raw ? JSON.parse(raw) : null;
    if (!token || user?.role === 'VENDOR') {
      const r = await apiFetch<{ tokens: { accessToken: string }; user: unknown }>('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ role: 'CONSUMER', id: 'consumer_demo' }),
      });
      if (!r.ok || !r.data) throw new Error(r.error || 'login failed');
      token = r.data.tokens.accessToken;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(r.data.user));
    }
    return token as string;
  }

  async function accept(quoteId: string) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const token = await ensureConsumer();
      const res = await fetch(`${API}/api/v1/jobs/${jobId}/quotes/${quoteId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setErr(body.error?.message || 'پذیرش پیشنهاد ناموفق');
        return;
      }
      setLastOrderId(body.data.orderId);
      setMsg(
        `پیشنهاد پذیرفته شد.\nسفارش: ${String(body.data.orderId).slice(0, 12)}…\nقیمت: ${fmt(body.data.quote?.priceToman || 0)} تومان`,
      );
      void loadQuotes();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function payOrder() {
    if (!lastOrderId) return;
    setBusy(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const pay = await apiFetch<{ id: string }>(`/orders/${lastOrderId}/pay`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `pay_${lastOrderId}_1`, Authorization: `Bearer ${token}` },
      });
      if (!pay.ok || !pay.data) {
        setErr(pay.error || 'پرداخت ناموفق');
        return;
      }
      const sim = await apiFetch<{ vendorCredit: number }>(`/payments/simulate/${pay.data.id}`, {
        method: 'POST',
      });
      if (sim.ok && sim.data) {
        setMsg(`پرداخت موفق — سهم فروشنده ${fmt(sim.data.vendorCredit)} تومان`);
      } else {
        setMsg('پرداخت ایجاد شد');
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">پیشنهادهای خدمت</h1>
          <p className="caption">v1.3 · قبول قیمت فروشنده + پرداخت</p>
        </div>
        <Link href="/book" className="btn-ghost">
          درخواست جدید
        </Link>
      </div>

      {msg && (
        <div className="alert alert-ok" style={{ whiteSpace: 'pre-wrap' }}>
          {msg}
        </div>
      )}
      {err && <div className="alert alert-error">{err}</div>}

      <section className="card stack-3">
        <div className="field">
          <label>شناسه درخواست (Job ID)</label>
          <input
            className="input-field mono"
            dir="ltr"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="job_..."
          />
        </div>
        <button type="button" className="btn-secondary" onClick={() => void loadQuotes()} disabled={!jobId.trim()}>
          بارگذاری پیشنهادها
        </button>
      </section>

      <section className="stack-3">
        {quotes.length === 0 && jobId && (
          <div className="card body-muted">پیشنهادی برای این درخواست ثبت نشده است.</div>
        )}
        {quotes.map((q) => (
          <div key={q.id} className="list-card stack-2">
            <div className="row-between">
              <div>
                <strong className="mono text-sm">{q.vendorProfileId}</strong>
                <div className="caption">
                  ETA: {q.etaHours} ساعت
                  {q.message ? ` · ${q.message}` : ''}
                </div>
              </div>
              <div className="price">{fmt(q.priceToman)}</div>
            </div>
            <div className="flex items-center justify-between">
              <span className="tag">{STATUS_FA[q.status] || q.status}</span>
              {q.status === 'PENDING' && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: 'auto', minHeight: 40, padding: '0 16px' }}
                  disabled={busy}
                  onClick={() => void accept(q.id)}
                >
                  قبول این پیشنهاد
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      {lastOrderId && (
        <section className="card stack-2">
          <h2 className="h2">سفارش ایجادشده</h2>
          <div className="mono text-xs" dir="ltr">
            {lastOrderId}
          </div>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void payOrder()}>
            پرداخت سفارش (بانک نمونه)
          </button>
        </section>
      )}

      <Link href="/book" className="btn-secondary">
        ثبت درخواست جدید
      </Link>
    </main>
  );
}
