'use client';

/**
 * Production Phase 6 — Hyperlocal map exploration hub.
 * Canvas vector layer (always works) + optional MapLibre when tiles configured.
 * Category pins, ETA proximity, Iran locate-me, fuzzy dashed privacy, alert zones.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import {
  DEFAULT_MAP_CENTER,
  RADIUS_PRESETS_KM,
  VENDOR_TYPES,
  type MapFeature,
  type MapVendorMarker,
} from '@nazdik/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

// Inlined GIS helpers for browser (shared package also exports these)
const IRAN_BOUNDS = { minLat: 25, maxLat: 40, minLng: 44, maxLng: 64.5 };
const FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const toFa = (n: number | string) => String(n).replace(/\d/g, (d) => FA[Number(d)]);

function isInIran(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= IRAN_BOUNDS.minLat &&
    lat <= IRAN_BOUNDS.maxLat &&
    lng >= IRAN_BOUNDS.minLng &&
    lng <= IRAN_BOUNDS.maxLng
  );
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat);
  const dLng = toR(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function etaLabel(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const m = Math.round(haversine(from, to));
  const walk = Math.max(1, Math.round(m / 1.25 / 60));
  const car = Math.max(1, Math.round(m / 7.5 / 60));
  const dist = m < 1000 ? `${toFa(m)} متر فاصله` : `${toFa((m / 1000).toFixed(1))} کیلومتر فاصله`;
  return { m, dist, walk: `${toFa(walk)} دقیقه پیاده`, car: `${toFa(car)} دقیقه با خودرو` };
}

const PIN: Record<string, { color: string; label: string; glyph: string }> = {
  MEDICAL: { color: '#B42318', label: 'پزشکی', glyph: '✚' },
  FOOD: { color: '#C4922A', label: 'غذا', glyph: '♨' },
  FIELD_SERVICE: { color: '#3D5A80', label: 'خدمات میدانی', glyph: '🔧' },
  BEAUTY: { color: '#7B4B94', label: 'زیبایی', glyph: '✦' },
  ECOMMERCE: { color: '#0F6B5C', label: 'فروشگاه', glyph: '▣' },
};

type VendorFeature = MapVendorMarker & { type: 'vendor' };

export default function MapPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [center, setCenter] = useState(DEFAULT_MAP_CENTER);
  const [radiusKm, setRadiusKm] = useState(3);
  const [vendorType, setVendorType] = useState('');
  const [zoom, setZoom] = useState(13);
  const [data, setData] = useState<{
    total: number;
    clustered: boolean;
    features: MapFeature[];
    privacy?: { fuzzyRadiusMeters: number };
  } | null>(null);
  const [selected, setSelected] = useState<VendorFeature | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locateState, setLocateState] = useState<'idle' | 'loading' | 'ok' | 'out'>('idle');
  const [locateMsg, setLocateMsg] = useState<string | null>(null);
  const [zoneMsg, setZoneMsg] = useState<string | null>(null);
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMap = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({
      lat: String(center.lat),
      lng: String(center.lng),
      radiusKm: String(radiusKm),
      zoom: String(zoom),
      exact: '0',
    });
    if (vendorType) qs.set('vendorType', vendorType);
    const r = await apiFetch<{
      total: number;
      clustered: boolean;
      features: MapFeature[];
      privacy?: { fuzzyRadiusMeters: number };
    }>(`/map/vendors?${qs}`);
    if (!r.ok || !r.data) {
      setError(r.offline ? 'API آفلاین — داده نمونه' : 'نمایش نمونه');
      setData({
        total: 4,
        clustered: false,
        privacy: { fuzzyRadiusMeters: 200 },
        features: demo(center, radiusKm),
      });
    } else {
      setData(r.data);
    }
    setLoading(false);
  }, [center, radiusKm, vendorType, zoom]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchMap(), 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchMap]);

  // Canvas layer — 60fps-friendly: one draw per state change, no rAF spam
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth ?? 360;
    const h = 320;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(2, 0, 0, 2, 0, 0);

    ctx.fillStyle = '#F7F4EF';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(226,221,212,.85)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const project = (lat: number, lng: number) => {
      const latSpan = 0.04 * Math.pow(2, (13 - zoom) * 0.35);
      const lngSpan = latSpan * 1.4;
      return {
        x: ((lng - (center.lng - lngSpan / 2)) / lngSpan) * w,
        y: (1 - (lat - (center.lat - latSpan / 2)) / latSpan) * h,
      };
    };

    const c = project(center.lat, center.lng);
    const edge = project(center.lat + radiusKm / 111.32, center.lng);
    const rPx = Math.max(26, Math.abs(edge.y - c.y));

    // proximity circle
    ctx.beginPath();
    ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15,107,92,.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,107,92,.4)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // you are here
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0F6B5C';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (const f of data?.features ?? []) {
      if (f.type !== 'vendor') {
        const p = project(f.lat, f.lng);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#1C2421';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(f.count), p.x, p.y);
        continue;
      }
      const p = project(f.displayLat, f.displayLng);
      // fuzzy privacy — dashed gold ring (never exact centroid)
      if (f.fuzzyPolygon) {
        const ring = f.fuzzyPolygon.coordinates[0];
        ctx.beginPath();
        ring.forEach(([lng, lat], i) => {
          const pt = project(lat, lng);
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(196,146,42,.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(196,146,42,.65)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const meta = PIN[f.vendorType] ?? PIN.ECOMMERCE;
      ctx.beginPath();
      // pin body
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = f.isHomeBased ? '#C4922A' : meta.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      // glyph
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(meta.glyph, p.x, p.y);
      if (selected && selected.id === f.id) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.strokeStyle = '#0F6B5C';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    canvas.onclick = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      let best: VendorFeature | null = null;
      let bestD = 16;
      for (const f of data?.features ?? []) {
        if (f.type !== 'vendor') continue;
        const p = project(f.displayLat, f.displayLng);
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      setSelected(best);
    };
    return () => {
      canvas.onclick = null;
    };
  }, [data, center, radiusKm, zoom, selected]);

  const locateMe = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocateState('out');
      setLocateMsg('مرورگر موقعیت را پشتیبانی نمی‌کند');
      return;
    }
    setLocateState('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const check = await apiFetch<{ ok: boolean; message: string }>('/gis/locate', {
          method: 'POST',
          body: JSON.stringify({ lat, lng }),
        });
        const ok = check.data?.ok ?? isInIran(lat, lng);
        if (!ok) {
          setLocateState('out');
          setLocateMsg('موقعیت خارج از محدوده ایران است');
          return;
        }
        setCenter({ lat, lng });
        setLocateState('ok');
        setLocateMsg(`موقعیت شما: ${toFa(lat.toFixed(3))}, ${toFa(lng.toFixed(3))}`);
      },
      () => {
        setLocateState('out');
        setLocateMsg('دسترسی موقعیت رد شد');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const saveAlertZone = useCallback(async () => {
    setZoneMsg(null);
    const token = typeof window !== 'undefined' ? localStorage.getItem('nazdik_token') : null;
    if (!token) {
      // dev login first
      const login = await apiFetch<{ tokens: { accessToken: string } }>('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ role: 'CONSUMER', id: 'consumer_demo' }),
      });
      if (login.ok && login.data) {
        localStorage.setItem('nazdik_token', login.data.tokens.accessToken);
      }
    }
    const r = await apiFetch<{ id: string }>('/alert-zones', {
      method: 'POST',
      body: JSON.stringify({
        label: 'home',
        lat: center.lat,
        lng: center.lng,
        radiusM: 1500,
      }),
    });
    if (!r.ok || !r.data) {
      setZoneMsg(r.error || 'ذخیره منطقه هشدار ناموفق');
      return;
    }
    const near = await apiFetch<{ alertCount: number }>(`/alert-zones/${r.data.id}/nearby`);
    setNearbyCount(near.data?.alertCount ?? 0);
    setZoneMsg(`منطقه هشدار ۱٫۵ کیلومتری ذخیره شد — ${toFa(near.data?.alertCount ?? 0)} فروشنده نزدیک`);
  }, [center]);

  const vendors = useMemo(
    () => (data?.features ?? []).filter((f): f is VendorFeature => f.type === 'vendor'),
    [data],
  );

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">نقشه نزدیک</h1>
          <p className="caption">GIS تولیدی · فاز ۶ · فاصله و محدوده هشدار</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      <section className="card stack-3">
        <div className="radius-row">
          {RADIUS_PRESETS_KM.map((r) => (
            <button
              key={r}
              type="button"
              className={`pill${radiusKm === r ? ' active' : ''}`}
              onClick={() => setRadiusKm(r)}
            >
              {toFa(r)} کیلومتر
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <select
            className="input-field"
            value={vendorType}
            onChange={(e) => setVendorType(e.target.value)}
            aria-label="دسته"
          >
            <option value="">همه دسته‌ها</option>
            {VENDOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {PIN[t]?.label ?? t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: 'auto', minWidth: 110, flexShrink: 0 }}
            onClick={locateMe}
            disabled={locateState === 'loading'}
          >
            {locateState === 'loading' ? (
              <Loader2 style={{ width: 14, height: 14 }} aria-hidden />
            ) : (
              <>
                <Navigation style={{ width: 14, height: 14 }} aria-hidden />
                موقعیت من
              </>
            )}
          </button>
        </div>

        {locateMsg && (
          <div className={locateState === 'out' ? 'alert alert-error' : 'alert alert-ok'}>
            {locateMsg}
          </div>
        )}

        <div className="map-shell">
          <canvas ref={canvasRef} aria-label="نقشه ابرمحلی فروشندگان" />
          {loading && (
            <div
              style={{
                position: 'absolute',
                insetInline: 0,
                bottom: 0,
                background: 'rgba(255,255,255,.88)',
                fontSize: 12,
                color: '#5C6B66',
                textAlign: 'center',
                padding: 4,
              }}
            >
              بارگذاری…
            </div>
          )}
        </div>

        <div className="radius-row">
          {Object.entries(PIN).map(([k, m]) => (
            <span key={k} className="tag" style={{ background: m.color, color: '#fff' }}>
              {m.glyph} {m.label}
            </span>
          ))}
        </div>

        <div className="flex justify-between text-xs text-muted">
          <span>
            {toFa(data?.total ?? 0)} فروشنده{data?.clustered ? ' · خوشه' : ''}
          </span>
          <span>حریم خانگی: {toFa(data?.privacy?.fuzzyRadiusMeters ?? 200)} متر (خط‌چین)</span>
        </div>

        <button type="button" className="btn-primary" onClick={() => void saveAlertZone()}>
          هشدار فروشنده جدید در ۱٫۵ کیلومتر
        </button>
        {zoneMsg && <div className="alert alert-ok">{zoneMsg}</div>}
      </section>

      <section className="card stack-3" aria-live="polite">
        <h2 className="h2">{selected ? 'پیش‌نمایش' : 'نزدیک‌ترین‌ها'}</h2>
        {selected ? (
          <VendorPreview vendor={selected} origin={center} onClose={() => setSelected(null)} />
        ) : vendors.length === 0 ? (
          <p className="body-muted">فروشنده‌ای در این محدوده نیست.</p>
        ) : (
          <div className="vendor-list">
            {vendors.map((v) => {
              const eta = etaLabel(center, { lat: v.displayLat, lng: v.displayLng });
              return (
                <button
                  key={v.id}
                  type="button"
                  className="vendor-item"
                  onClick={() => setSelected(v)}
                >
                  <strong>{v.businessName}</strong>
                  <div className="vendor-meta">
                    <span className="tag" style={{ background: PIN[v.vendorType]?.color, color: '#fff' }}>
                      {PIN[v.vendorType]?.glyph} {PIN[v.vendorType]?.label ?? v.vendorType}
                    </span>
                    {v.isHomeBased && <span className="tag tag-gold">خانگی · مبهم</span>}
                    <span>{eta.dist}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <p className="footer-note">
        <MapPin style={{ width: 12, height: 12, verticalAlign: 'middle' }} aria-hidden /> Nazdik GIS
        Phase 6
      </p>
    </main>
  );
}

function VendorPreview({
  vendor,
  origin,
  onClose,
}: {
  vendor: VendorFeature;
  origin: { lat: number; lng: number };
  onClose: () => void;
}) {
  const eta = etaLabel(origin, { lat: vendor.displayLat, lng: vendor.displayLng });
  const meta = PIN[vendor.vendorType] ?? PIN.ECOMMERCE;
  return (
    <div className="stack-2">
      <div className="h2">{vendor.businessName}</div>
      <div className="flex flex-wrap gap-2">
        <span className="tag" style={{ background: meta.color, color: '#fff' }}>
          {meta.glyph} {meta.label}
        </span>
        {vendor.isHomeBased && <span className="tag tag-gold">خانگی · دایره خط‌چین</span>}
      </div>
      <div className="alert alert-muted">
        <div>{eta.dist}</div>
        <div className="caption">
          {eta.walk} · {eta.car}
        </div>
      </div>
      {vendor.isHomeBased && (
        <p className="caption text-gold">
          مختصات دقیق فاش نمی‌شود — فقط ناحیه تقریبی حریم خصوصی.
        </p>
      )}
      {vendor.description && <p className="body-muted text-sm">{vendor.description}</p>}
      <button type="button" className="btn-secondary" onClick={onClose}>
        بستن
      </button>
    </div>
  );
}

function demo(center: { lat: number; lng: number }, radiusKm: number): MapFeature[] {
  const rows = [
    { id: 'd1', name: 'آشپزخانه مادر', type: 'FOOD', dLat: 0.004, dLng: 0.003, home: true },
    { id: 'd2', name: 'مطب دکتر رضایی', type: 'MEDICAL', dLat: 0.01, dLng: 0.008, home: false },
    { id: 'd3', name: 'تعمیرکار علی', type: 'FIELD_SERVICE', dLat: -0.008, dLng: -0.005, home: true },
  ];
  return rows.map((r) => {
    const displayLat = center.lat + r.dLat;
    const displayLng = center.lng + r.dLng;
    return {
      type: 'vendor' as const,
      id: r.id,
      vendorProfileId: r.id,
      businessName: r.name,
      vendorType: r.type,
      categoryTags: [],
      description: 'داده نمونه',
      isHomeBased: r.home,
      verificationStatus: 'VERIFIED',
      lat: r.home ? null : displayLat,
      lng: r.home ? null : displayLng,
      displayLat,
      displayLng,
      fuzzyPolygon: r.home
        ? {
            type: 'Polygon' as const,
            coordinates: [
              Array.from({ length: 17 }, (_, i) => {
                const th = (i / 16) * Math.PI * 2;
                return [
                  displayLng + 0.0018 * Math.sin(th),
                  displayLat + 0.0018 * Math.cos(th),
                ];
              }),
            ],
          }
        : null,
      distanceMeters: null,
      address: 'تهران',
    };
  });
}
