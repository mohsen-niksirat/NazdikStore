'use client';

/**
 * Production Phase 7 — Jalali appointment booking + RFQ.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Wrench } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const TOKEN_KEY = 'nazdik_token';
const USER_KEY = 'nazdik_user';

type JalaliSlot = {
  startMinute: number;
  endMinute: number;
  faTime: string;
  available: boolean;
  jalaliLabel?: string;
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
    const r = await apiFetch<{ tokens: { accessToken: string }; user: unknown }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ role: 'CONSUMER', id: 'consumer_demo' }),
    });
    if (!r.ok || !r.data) throw new Error(r.error || 'login failed');
    token = r.data.tokens.accessToken;
    user = r.data.user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  return token as string;
}

export default function BookPage() {
  const [tab, setTab] = useState<'slot' | 'rfq'>('slot');
  const [day, setDay] = useState(() => {
    // default: Tehran-ish today (browser local ok for demo)
    return new Date().toISOString().slice(0, 10);
  });
  const [jalaliLabel, setJalaliLabel] = useState('');
  const [slots, setSlots] = useState<JalaliSlot[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobTitle, setJobTitle] = useState('تعمیر پکیج');
  const [jobDesc, setJobDesc] = useState('پکیج روشن نمی‌شود');
  const [lastOrder, setLastOrder] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    setErr(null);
    const r = await apiFetch<{ day: string; jalaliLabel: string; slots: JalaliSlot[] }>(
      `/vendors/vp_clinic_demo/slots-jalali?day=${day}`,
    );
    if (!r.ok || !r.data) {
      // fallback legacy slots
      const legacy = await apiFetch<{ slots: Array<{ startMinute: number; endMinute: number; isBooked: boolean; id: string }> }>(
        `/vendors/vp_clinic_demo/slots?day=${day}`,
      );
      if (legacy.ok && legacy.data) {
        setSlots(
          (legacy.data.slots || []).map((s) => ({
            startMinute: s.startMinute,
            endMinute: s.endMinute,
            faTime: minLabel(s.startMinute),
            available: !s.isBooked,
          })),
        );
        setJalaliLabel(legacy.ok ? '' : '');
      } else {
        setSlots([]);
        setErr(r.error || 'نوبتی یافت نشد');
      }
      return;
    }
    setJalaliLabel(r.data.jalaliLabel || '');
    setSlots(r.data.slots || []);
  }, [day]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function book(slot: JalaliSlot) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const token = await ensureConsumer();
      const r = await apiFetch<{
        orderId: string;
        faTime: string;
        jalaliLabel: string;
        bufferMinutes: number;
      }>('/orders/appointments-jalali', {
        method: 'POST',
        body: JSON.stringify({
          vendorProfileId: 'vp_clinic_demo',
          day,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
          priceToman: 400000,
        }),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok || !r.data) {
        setErr(r.error || 'رزرو ناموفق — ساعت ممکن است پر باشد');
        return;
      }
      setLastOrder(r.data.orderId);
      setMsg(
        `نوبت ${r.data.jalaliLabel} ساعت ${r.data.faTime} رزرو شد (بافر ${r.data.bufferMinutes} دقیقه).`,
      );
      void loadSlots();
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
      const r = await apiFetch<{ job?: { id: string }; id?: string }>('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: jobTitle,
          description: jobDesc,
          lat: 35.6892,
          lng: 51.389,
          radiusKm: 8,
        }),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok || !r.data) {
        setErr(r.error || 'ثبت درخواست ناموفق');
        return;
      }
      const jobId = r.data.job?.id || r.data.id;
      if (jobId) sessionStorage.setItem('nazdik_job_id', jobId);
      setMsg(`درخواست «${jobTitle}» ثبت شد.\nشناسه: ${jobId}`);
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
          <h1 className="h1">نوبت شمسی</h1>
          <p className="caption">فاز ۷ · تقویم جلالی · Asia/Tehran · بافر نوبت</p>
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
          {jalaliLabel && (
            <div className="alert alert-muted">
              <strong>{jalaliLabel}</strong>
              <div className="caption">منطقه زمانی: Asia/Tehran</div>
            </div>
          )}
          <div className="field">
            <label>تاریخ (میلادی مرجع)</label>
            <input className="input-field" dir="ltr" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="radius-row">
            {slots.filter((s) => s.available).length === 0 && (
              <p className="body-muted">ساعت خالی نیست (ممکن است بافر/تعارض اعمال شده باشد).</p>
            )}
            {slots.map((s, i) => (
              <button
                key={`${s.startMinute}-${i}`}
                type="button"
                className={`pill${s.available ? ' active' : ''}`}
                disabled={!s.available || busy}
                style={s.available ? undefined : { opacity: 0.45 }}
                onClick={() => void book(s)}
              >
                {s.faTime || minLabel(s.startMinute)}
                {s.available ? '' : ' · پر'}
              </button>
            ))}
          </div>
          <Link href={`/messages${lastOrder ? `?order=${lastOrder}` : ''}`} className="btn-secondary">
            چت نوبت / سفارش
          </Link>
        </section>
      ) : (
        <section className="card stack-3">
          <h2 className="h2">درخواست خدمت (RFQ)</h2>
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
        </section>
      )}

      <Link href="/rfq" className="btn-secondary">
        پیشنهادهای خدمت
      </Link>
    </main>
  );
}