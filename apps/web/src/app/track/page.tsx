'use client';

/**
 * Enterprise Phase 11 — Live delivery tracking (main page).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const fa = (n: number | string) => String(n).replace(/\d/g, (d) => FA[Number(d)]);

const STATUS_FA: Record<string, string> = {
  ASSIGNED: 'اختصاص داده شد',
  PICKED_UP: 'برداشته شد',
  ARRIVED_AT_DESTINATION: 'رسید به مقصد',
  DELIVERED: 'تحویل شد',
  CANCELLED: 'لغو شد',
};

type TrackState = {
  status: string;
  lastPoint: { lat: number; lng: number; headingDeg?: number } | null;
  trail: Array<{ lat: number; lng: number }>;
  dest: { lat: number; lng: number };
  etaMinutes: number | null;
  etaFa: string | null;
  distanceMeters: number | null;
  courier?: { displayName: string; vehicle: string };
};

function project(lat: number, lng: number, w: number, h: number, center: { lat: number; lng: number }) {
  const span = 0.02;
  const x = ((lng - (center.lng - span / 2)) / span) * w;
  const y = (1 - (lat - (center.lat - span / 2)) / span) * h;
  return { x, y };
}

export default function TrackPage() {
  const [orderId, setOrderId] = useState('track_demo_1');
  const [tokenRole, setTokenRole] = useState<'consumer' | 'courier' | 'outsider'>('consumer');
  const [track, setTrack] = useState<TrackState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('order');
    if (q) setOrderId(q);
  }, []);

  const login = useCallback(async (role: 'consumer' | 'courier' | 'outsider') => {
    setTokenRole(role);
    const id =
      role === 'courier' ? 'courier_demo' : role === 'outsider' ? 'stranger_x' : 'consumer_demo';
    const r = await apiFetch<{ tokens: { accessToken: string } }>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({
        role: role === 'courier' ? 'COURIER' : 'CONSUMER',
        id,
      }),
    });
    if (!r.ok || !r.data) {
      setErr(r.error || 'login failed');
      return;
    }
    localStorage.setItem('nazdik_token', r.data.tokens.accessToken);
    localStorage.setItem(
      'nazdik_user',
      JSON.stringify({ id, role: role === 'courier' ? 'COURIER' : 'CONSUMER' }),
    );
    setMsg(`ورود ${role}`);
  }, []);

  const setup = useCallback(async () => {
    setErr(null);
    await apiFetch('/couriers/me', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'پیک علی', vehicle: 'motor' }),
    });
    const d = await apiFetch(`/orders/${orderId}/dispatch`, {
      method: 'POST',
      body: JSON.stringify({
        courierUserId: 'courier_demo',
        vehicle: 'motor',
        destLat: 35.692,
        destLng: 51.392,
      }),
    });
    if (!d.ok && d.error && !String(d.error).includes('اختصاص')) setErr(d.error);
    else setMsg('پیک به سفارش اختصاص یافت (ASSIGNED)');
  }, [orderId]);

  const fetchTrack = useCallback(async () => {
    const r = await apiFetch<TrackState>(`/tracking/${orderId}`);
    if (!r.ok || !r.data) {
      if (r.error) setErr(r.error);
      return;
    }
    setErr(null);
    setTrack(r.data);
  }, [orderId]);

  const emitGps = useCallback(async () => {
    setErr(null);
    const base = track?.lastPoint || { lat: 35.68, lng: 51.38 };
    const dest = track?.dest || { lat: 35.692, lng: 51.392 };
    const lat = base.lat + (dest.lat - base.lat) * 0.15 + (Math.random() - 0.5) * 0.0002;
    const lng = base.lng + (dest.lng - base.lng) * 0.15 + (Math.random() - 0.5) * 0.0002;
    const r = await apiFetch<{ etaFa?: string; latencyMs?: number }>(
      `/tracking/${orderId}/point`,
      {
        method: 'POST',
        body: JSON.stringify({ lat, lng, t: Date.now(), speed: 8, headingDeg: 45 }),
      },
    );
    if (!r.ok) {
      setErr(r.error || 'GPS fail — ابتدا وارد پیک شوید و اختصاص دهید');
      return;
    }
    setMsg(`GPS ارسال شد · ${r.data?.etaFa || ''} · ${fa(Math.round(r.data?.latencyMs || 0))}ms`);
    void fetchTrack();
  }, [orderId, track, fetchTrack]);

  const advance = useCallback(
    async (status: string) => {
      const r = await apiFetch(`/orders/${orderId}/dispatch/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      if (!r.ok) setErr(r.error || 'تغییر وضعیت ناموفق');
      else setMsg(`وضعیت → ${STATUS_FA[status] || status}`);
      void fetchTrack();
    },
    [orderId, fetchTrack],
  );

  useEffect(() => {
    void fetchTrack();
    const t = setInterval(() => void fetchTrack(), 1500);
    return () => clearInterval(t);
  }, [fetchTrack]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.parentElement?.clientWidth ?? 360;
    const h = 260;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#F7F4EF';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#E2DDD4';
    for (let x = 0; x < w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    if (!track) return;
    const center = track.lastPoint || track.dest;
    const destP = project(track.dest.lat, track.dest.lng, w, h, center);
    ctx.beginPath();
    track.trail.forEach((p, i) => {
      const pt = project(p.lat, p.lng, w, h, center);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.strokeStyle = '#0F6B5C';
    ctx.lineWidth = 2;
    ctx.stroke();
    const pulse = 8 + Math.sin(Date.now() / 280) * 2;
    ctx.beginPath();
    ctx.arc(destP.x, destP.y, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = '#C4922A';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(destP.x, destP.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#C4922A';
    ctx.fill();
    if (track.lastPoint) {
      const c = project(track.lastPoint.lat, track.lastPoint.lng, w, h, center);
      ctx.beginPath();
      ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#0F6B5C';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [track]);

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">رهگیری زنده پیک</h1>
          <p className="caption">فاز ۱۱ · dispatch + GPS صاف‌شده</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {msg && <div className="alert alert-ok">{msg}</div>}
      {err && <div className="alert alert-error">{err}</div>}

      <section className="card stack-3">
        <div className="field">
          <label>شناسه سفارش</label>
          <input
            className="input-field mono"
            dir="ltr"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
          />
        </div>
        <div className="radius-row">
          {(
            [
              ['consumer', 'مشتری'],
              ['courier', 'پیک'],
              ['outsider', 'بیگانه'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`pill${tokenRole === k ? ' active' : ''}`}
              onClick={() => void login(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            style={{ width: 'auto', minHeight: 40 }}
            onClick={() => void setup()}
          >
            اختصاص پیک
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: 'auto', minHeight: 40 }}
            onClick={() => void emitGps()}
          >
            شبیه‌سازی GPS
          </button>
          {['PICKED_UP', 'ARRIVED_AT_DESTINATION', 'DELIVERED'].map((s) => (
            <button key={s} type="button" className="btn-ghost" onClick={() => void advance(s)}>
              {STATUS_FA[s]}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack-3">
        <div className="row-between">
          <h2 className="h2">وضعیت مسیر</h2>
          <span className="tag">{track ? STATUS_FA[track.status] || track.status : '—'}</span>
        </div>
        {track?.etaFa && <div className="alert alert-ok">{track.etaFa}</div>}
        {track?.courier && (
          <div className="caption">
            پیک: {track.courier.displayName} · {track.courier.vehicle}
          </div>
        )}
        <div className="map-shell">
          <canvas ref={canvasRef} aria-label="نقشه رهگیری پیک" />
        </div>
        <div className="caption">
          فاصله تا مقصد:{' '}
          {track?.distanceMeters != null ? `${fa(track.distanceMeters)} متر` : '—'}
        </div>
      </section>
    </main>
  );
}
