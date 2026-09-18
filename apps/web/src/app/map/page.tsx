'use client';

/**
 * NazdikStore map — Phase 2.
 * Canvas equirectangular map (no tile server required) + radius filters.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import {
  DEFAULT_MAP_CENTER,
  RADIUS_PRESETS_KM,
  VENDOR_TYPES,
  type MapFeature,
  type MapVendorMarker,
} from '@nazdik/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

type VendorType = (typeof VENDOR_TYPES)[number];

interface MapApiResponse {
  center: { lat: number; lng: number } | null;
  radiusKm: number | null;
  clustered: boolean;
  total: number;
  features: MapFeature[];
  privacy: { fuzzyRadiusMeters: number };
}

const TYPE_LABELS: Record<string, string> = {
  MEDICAL: 'پزشکی',
  FOOD: 'غذا',
  ECOMMERCE: 'فروشگاهی',
  FIELD_SERVICE: 'خدمات میدانی',
  BEAUTY: 'زیبایی',
};

const TYPE_COLORS: Record<string, string> = {
  MEDICAL: '#B42318',
  FOOD: '#C4922A',
  ECOMMERCE: '#0F6B5C',
  FIELD_SERVICE: '#3D5A80',
  BEAUTY: '#7B4B94',
  cluster: '#1C2421',
};

function formatDistance(m: number | null): string {
  if (m == null) return '—';
  if (m < 1000) return `${Math.round(m)} متر`;
  return `${(m / 1000).toFixed(1)} کیلومتر`;
}

export default function MapPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [center, setCenter] = useState(DEFAULT_MAP_CENTER);
  const [radiusKm, setRadiusKm] = useState(3);
  const [vendorType, setVendorType] = useState<VendorType | ''>('');
  const [zoom, setZoom] = useState(13);
  const [data, setData] = useState<MapApiResponse | null>(null);
  const [selected, setSelected] = useState<MapVendorMarker | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'ok' | 'denied'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vendor panel deep-link: /map?lat=&lng=&radiusKm=
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const lat = Number(q.get('lat'));
    const lng = Number(q.get('lng'));
    const rk = Number(q.get('radiusKm'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setCenter({ lat, lng });
    }
    if (Number.isFinite(rk) && rk > 0) setRadiusKm(rk);
  }, []);

  const project = useCallback(
    (lat: number, lng: number, w: number, h: number) => {
      const latSpan = 0.04 * Math.pow(2, (13 - zoom) * 0.35);
      const lngSpan = latSpan * 1.4;
      const x = ((lng - (center.lng - lngSpan / 2)) / lngSpan) * w;
      const y = (1 - (lat - (center.lat - latSpan / 2)) / latSpan) * h;
      return { x, y };
    },
    [center, zoom],
  );

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
    try {
      const res = await fetch(`${API_URL}/api/v1/map/vendors?${qs.toString()}`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        setData(demoResponse(center, radiusKm));
        setError('نمایش داده‌های نمونه (سرور در دسترس نیست)');
        return;
      }
      setData(body.data as MapApiResponse);
    } catch {
      setData(demoResponse(center, radiusKm));
      setError('نمایش داده‌های نمونه (سرور در دسترس نیست)');
    } finally {
      setLoading(false);
    }
  }, [center, radiusKm, vendorType, zoom]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchMap();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchMap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth ?? 360;
    const h = 300;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);

    // soft paper + subtle grid
    ctx.fillStyle = '#F7F4EF';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(226, 221, 212, 0.9)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
    for (let j = 0; j < h; j += 24) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(w, j);
      ctx.stroke();
    }

    const c = project(center.lat, center.lng, w, h);
    const edge = project(center.lat + radiusKm / 111.32, center.lng, w, h);
    const rPx = Math.max(28, Math.abs(edge.y - c.y));

    ctx.beginPath();
    ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 107, 92, 0.07)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 107, 92, 0.45)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // center pin
    ctx.beginPath();
    ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#0F6B5C';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    for (const f of data?.features ?? []) {
      if (f.type === 'cluster') {
        const p = project(f.lat, f.lng, w, h);
        const rr = Math.min(26, 12 + Math.log2(f.count + 1) * 3.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.fillStyle = '#1C2421';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(f.count), p.x, p.y);
      } else {
        const p = project(f.displayLat, f.displayLng, w, h);
        if (f.fuzzyPolygon) {
          const ring = f.fuzzyPolygon.coordinates[0];
          ctx.beginPath();
          ring.forEach(([lng, lat], i) => {
            const pt = project(lat, lng, w, h);
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.fillStyle = 'rgba(196, 146, 42, 0.12)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(196, 146, 42, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        const color = TYPE_COLORS[f.vendorType] ?? '#0F6B5C';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = f.isHomeBased ? '#C4922A' : color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (selected && selected.id === f.id) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
          ctx.strokeStyle = '#0F6B5C';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }
    }

    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      let best: MapVendorMarker | null = null;
      let bestD = 18;
      for (const f of data?.features ?? []) {
        if (f.type === 'cluster') continue;
        const p = project(f.displayLat, f.displayLng, w, h);
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      setSelected(best);
    };
    canvas.onclick = onClick;
    return () => {
      canvas.onclick = null;
    };
  }, [data, center, radiusKm, zoom, project, selected]);

  const askGeolocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoState('denied');
      return;
    }
    setGeoState('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState('ok');
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const vendorFeatures = useMemo(
    () =>
      (data?.features ?? []).filter(
        (f): f is { type: 'vendor' } & MapVendorMarker => f.type === 'vendor',
      ),
    [data],
  );

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">نقشه نزدیک</h1>
          <p className="caption">فروشنده‌ها در شعاع انتخابی · مکان خانگی مبهم</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      <section className="card stack-3">
        <div className="radius-row" role="group" aria-label="شعاع">
          {RADIUS_PRESETS_KM.map((r) => (
            <button
              key={r}
              type="button"
              className={`pill${radiusKm === r ? ' active' : ''}`}
              onClick={() => setRadiusKm(r)}
            >
              {r} کیلومتر
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <select
            className="input-field"
            value={vendorType}
            onChange={(e) => setVendorType(e.target.value as VendorType | '')}
            aria-label="نوع فروشنده"
          >
            <option value="">همه دسته‌ها</option>
            {VENDOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: 'auto', minWidth: 120, flexShrink: 0 }}
            onClick={askGeolocation}
          >
            {geoState === 'loading' ? '…' : 'موقعیت من'}
          </button>
        </div>

        <div className="map-shell">
          <canvas ref={canvasRef} aria-label="نقشه فروشندگان نزدیک" />
          {loading && (
            <div
              style={{
                position: 'absolute',
                insetInline: 0,
                bottom: 0,
                background: 'rgba(255,255,255,0.85)',
                padding: '4px 10px',
                fontSize: 12,
                color: '#5C6B66',
                textAlign: 'center',
              }}
            >
              در حال بارگذاری…
            </div>
          )}
        </div>

        {error && (
          <div className="alert alert-muted" role="status">
            {error}
          </div>
        )}

        <div className="flex justify-between items-center text-xs text-muted">
          <span>
            {data?.total ?? 0} فروشنده{data?.clustered ? ' · خوشه‌بندی' : ''}
          </span>
          <span>حریم خصوصی خانگی: {data?.privacy?.fuzzyRadiusMeters ?? 200} متر</span>
        </div>
      </section>

      <section className="card stack-3" aria-live="polite">
        <h2 className="h2">{selected ? 'پیش‌نمایش فروشنده' : 'نزدیک‌ترین‌ها'}</h2>
        {selected ? (
          <div className="stack-2">
            <div className="h2">{selected.businessName}</div>
            <div className="flex flex-wrap gap-2">
              <span className="tag">{TYPE_LABELS[selected.vendorType] ?? selected.vendorType}</span>
              {selected.isHomeBased && <span className="tag tag-gold">خانگی · مبهم</span>}
              <span className="caption">{formatDistance(selected.distanceMeters)}</span>
            </div>
            {selected.description && <p className="body-muted">{selected.description}</p>}
            {selected.address && <p className="caption">{selected.address}</p>}
            {selected.isHomeBased && (
              <div className="alert alert-muted">
                مختصات دقیق تا تایید سفارش نمایش داده نمی‌شود.
              </div>
            )}
            <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
              بستن
            </button>
          </div>
        ) : vendorFeatures.length === 0 ? (
          <p className="body-muted">فروشنده‌ای در این محدوده یافت نشد.</p>
        ) : (
          <div className="vendor-list">
            {vendorFeatures.map((v) => (
              <button
                key={v.id}
                type="button"
                className="vendor-item"
                onClick={() => setSelected(v)}
              >
                <strong>{v.businessName}</strong>
                <div className="vendor-meta">
                  <span className="tag">{TYPE_LABELS[v.vendorType] ?? v.vendorType}</span>
                  {v.isHomeBased && <span className="tag tag-gold">خانگی</span>}
                  <span>{formatDistance(v.distanceMeters)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="footer-note">
        <MapPin style={{ width: 12, height: 12, verticalAlign: 'middle' }} aria-hidden /> NazdikStore
        map engine
      </p>
    </main>
  );
}

function demoResponse(center: { lat: number; lng: number }, radiusKm: number): MapApiResponse {
  const demos = [
    { id: 'd1', name: 'آشپزخانه مادر', type: 'FOOD', lat: center.lat + 0.004, lng: center.lng + 0.003, home: true, dist: 650 },
    { id: 'd2', name: 'نانوایی نزدیک', type: 'FOOD', lat: center.lat - 0.003, lng: center.lng + 0.002, home: false, dist: 420 },
    { id: 'd3', name: 'مطب دکتر رضایی', type: 'MEDICAL', lat: center.lat + 0.012, lng: center.lng + 0.008, home: false, dist: 1400 },
    { id: 'd4', name: 'تعمیرکار علی', type: 'FIELD_SERVICE', lat: center.lat - 0.01, lng: center.lng - 0.006, home: true, dist: 1100 },
  ].filter((d) => d.dist <= radiusKm * 1000);

  return {
    center,
    radiusKm,
    clustered: false,
    total: demos.length,
    privacy: { fuzzyRadiusMeters: 200 },
    features: demos.map((d) => {
      const displayLat = d.home ? d.lat + 0.0008 : d.lat;
      const displayLng = d.home ? d.lng + 0.0006 : d.lng;
      return {
        type: 'vendor' as const,
        id: d.id,
        vendorProfileId: d.id,
        businessName: d.name,
        vendorType: d.type,
        categoryTags: [],
        description: 'داده نمونه',
        isHomeBased: d.home,
        verificationStatus: 'VERIFIED',
        lat: d.home ? null : d.lat,
        lng: d.home ? null : d.lng,
        displayLat,
        displayLng,
        fuzzyPolygon: d.home
          ? {
              type: 'Polygon' as const,
              coordinates: [
                Array.from({ length: 13 }, (_, i) => {
                  const th = (i / 12) * Math.PI * 2;
                  return [displayLng + 0.0018 * Math.sin(th), displayLat + 0.0018 * Math.cos(th)];
                }),
              ],
            }
          : null,
        distanceMeters: d.dist,
        address: 'تهران',
      };
    }),
  };
}
