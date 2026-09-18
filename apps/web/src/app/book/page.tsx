'use client';

/**
 * Phase 12 — Appointment booking UI (demo clinic) + RFQ job request.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Wrench } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

type Slot = {
  id: string;
  day: string;
  startMinute: number;
  endMinute: number;
  isBooked: boolean;
  startLabel?: string;
  endLabel?: string;
};

function minLabel(m: number) {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

async function ensureConsumer() {
  let token = localStorage.getItem(TOKEN_KEY);
  const raw = localStorage.getItem(USER_KEY);
  let user = raw ? JSON.parse(raw) : null;
  if (!token || (user && user.role !== 'CONSUMER' && user.role !== 'VENDOR')) {
    const res = await fetch(`${API}/api/v1/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'CONSUMER', id: 'consumer_demo' }),
    });
    const body = await res.json();
    if (!body.success) throw new Error('login failed');
    token = body.data.tokens.accessToken;
    user = body.data.user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  return token as string;
}

export default function BookPage() {
  const [tab, setTab] = useState<'slot' | 'rfq'>('slot');
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobTitle, setJobTitle] = useState('تعمیر پکیج');
  const [jobDesc, setJobDesc] = useState('پکیج روشن نمی‌شود');
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`${API}/api/v1/vendors/vp_clinic_demo/slots?day=${day}`);
      const body = await res.json();
      if (!body.success) {
        setSlots([]);
        setErr('نوبتی یافت نشد — API را ری‌استارت کنید');
        return;
      }
      setSlots(body.data.slots || []);
    } catch {
      setErr('API در دسترس نیست (:4000)');
    }
  }, [day]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function book(slot: Slot) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const token = await ensureConsumer();
      const res = await fetch(`${API}/api/v1/orders/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          vendorProfileId: 'vp_clinic_demo',
          slotId: slot.id,
          priceToman: 400000,
          note: 'نوبت دمو',
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setErr(body.error?.message || `رزرو ناموفق (${body.error?.details?.reason || body.error?.code || 'error'})`);
        return;
      }
      setLastOrder(body.data.id);
      setMsg(`نوبت ${minLabel(slot.startMinute)} رزرو شد — سفارش ${body.data.id.slice(0, 10)}…`);
      void loadSlots();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function payLast() {
    if (!lastOrder) return;
    setBusy(true);
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const res = await fetch(`${API}/api/v1/orders/${lastOrder}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': `pay_${lastOrder}_1`,
        },
      });
      const body = await res.json();
      if (!body.success) {
        setErr(body.error?.message || 'پرداخت ناموفق');
        return;
      }
      const sim = await fetch(`${API}/api/v1/payments/simulate/${body.data.id}`, { method: 'POST' });
      const simBody = await sim.json();
      setMsg(
        simBody.success
          ? `پرداخت نوبت موفق — سهم فروشنده ${simBody.data.vendorCredit.toLocaleString('fa-IR')} تومان`
          : 'پرداخت ایجاد شد',
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRfq() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const token = await ensureConsumer();
      const res = await fetch(`${API}/api/v1/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: jobTitle,
          description: jobDesc,
          lat: 35.6892,
          lng: 51.389,
          radiusKm: 8,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setErr(body.error?.message || 'ثبت درخواست ناموفق');
        return;
      }
      const jobId = body.data.job?.id || body.data.id;
      if (jobId) sessionStorage.setItem('nazdik_job_id', jobId);
      setMsg(
        `درخواست «${jobTitle}» ثبت شد.\nشناسه: ${jobId}\nبه فروشندگان خدمات میدانی نزدیک اطلاع داده شد.`,
      );
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
          <h1 className="h1">نوبت و درخواست خدمت</h1>
          <p className="caption">فاز ۱۲ · رزرو نوبت + RFQ</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {msg && (
        <div className="alert alert-ok" style={{ whiteSpace: 'pre-wrap' }}>
          {msg}
        </div>
      )}
      {err && <div className="alert alert-error">{err}</div>}

      <div className="tabs" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button type="button" className={`tab${tab === 'slot' ? ' active' : ''}`} onClick={() => setTab('slot')}>
          <Calendar style={{ width: 14, height: 14, verticalAlign: 'middle' }} aria-hidden /> نوبت مطب
        </button>
        <button type="button" className={`tab${tab === 'rfq' ? ' active' : ''}`} onClick={() => setTab('rfq')}>
          <Wrench style={{ width: 14, height: 14, verticalAlign: 'middle' }} aria-hidden /> درخواست خدمت
        </button>
      </div>

      {tab === 'slot' ? (
        <section className="card stack-3">
          <h2 className="h2">مطب دکتر رضایی</h2>
          <div className="field">
            <label>تاریخ</label>
            <input className="input-field" dir="ltr" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="radius-row">
            {slots.filter((s) => !s.isBooked).length === 0 && (
              <p className="body-muted">ساعت خالی برای این روز نیست.</p>
            )}
            {slots.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`pill${s.isBooked ? '' : ' active'}`}
                disabled={s.isBooked || busy}
                style={s.isBooked ? { opacity: 0.45 } : undefined}
                onClick={() => void book(s)}
              >
                {minLabel(s.startMinute)}
                {s.isBooked ? ' · پر' : ''}
              </button>
            ))}
          </div>
          {lastOrder && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void payLast()}>
              پرداخت نوبت (۴۰۰٬۰۰۰ تومان)
            </button>
          )}
        </section>
      ) : (
        <section className="card stack-3">
          <h2 className="h2">درخواست خدمت (مزایده معکوس)</h2>
          <div className="field">
            <label>عنوان</label>
            <input className="input-field" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>شرح مشکل</label>
            <textarea
              className="input-field"
              style={{ minHeight: 90, paddingTop: 10 }}
              value={jobDesc}
              onChange={(e) => setJobDesc(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary" disabled={busy || !jobTitle.trim()} onClick={() => void submitRfq()}>
            ارسال به فروشندگان نزدیک
          </button>
          <p className="caption">درخواست برای خدمات میدانی در شعاع ۸ کیلومتری ارسال می‌شود.</p>
        </section>
      )}

      <Link href="/rfq" className="btn-secondary">
        مشاهده پیشنهادهای خدمت
      </Link>
      <Link href="/map" className="btn-secondary">
        نقشه نزدیک
      </Link>
    </main>
  );
}
