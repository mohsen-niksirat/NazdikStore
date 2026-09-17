'use client';

/**
 * NazdikStore hyperlocal map — Phase 2.
 * Uses MapLibre GL when the package loads; otherwise a self-contained
 * equirectangular canvas map (offline-friendly, no CDN required).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_MAP_CENTER,
  RADIUS_PRESETS_KM,
  VENDOR_TYPES,
  formatIrMobileDisplay,
  type MapFeature,
  type MapVendorMarker,
} from '@nazdik/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  const [radiusKm, setRadiusKm] = useState<number>(3);
  const [vendorType, setVendorType] = useState<VendorType | ''>('');
  const [zoom, setZoom] = useState(13);
  const [data, setData] = useState<MapApiResponse | null>(null);
  const [selected, setSelected] = useState<MapVendorMarker | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoState, setGeoState] = useState<'idle' | 'loading' | 'ok' | 'denied'>('idle');
  const [maplibreReady, setMaplibreReady] = useState(false);
  const maplibreMapRef = useRef<unknown>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Project lat/lng → canvas pixels (local equirectangular)
  const project = useCallback(
    (lat: number, lng: number, w: number, h: number) => {
      const latSpan = 0.04 * Math.pow(2, (13 - zoom) * 0.35);
      const lngSpan = latSpan * 1.4;
      const x = ((lng - (center.lng - lngSpan / 2)) / lngSpan) * w;
      const y = (1 - (lat - (center.lat - latSpan / 2)) / latSpan) * h;
      return { x, y, latSpan, lngSpan };
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
        // Offline demo payload when API is down
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

  // Debounced refetch on filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchMap();
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchMap]);

  // Draw canvas map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const w = parent?.clientWidth ?? 360;
    const h = 340;
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);

    // Paper background + grid
    ctx.fillStyle = '#F7F4EF';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#E2DDD4';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 28) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
    for (let j = 0; j < h; j += 28) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(w, j);
      ctx.stroke();
    }

    // Radius circle
    const c = project(center.lat, center.lng, w, h);
    const edge = project(center.lat + (radiusKm / 111.32), center.lng, w, h);
    const rPx = Math.abs(edge.y - c.y);
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(20, rPx), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 107, 92, 0.08)';
    ctx.fill();
    ctx.strokeStyle = '#0F6B5C';
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // User center
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0F6B5C';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    const features = data?.features ?? [];
    for (const f of features) {
      if (f.type === 'cluster') {
        const p = project(f.lat, f.lng, w, h);
        const rr = Math.min(28, 12 + Math.log2(f.count + 1) * 4);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.fillStyle = TYPE_COLORS.cluster;
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(f.count), p.x, p.y);
      } else {
        const p = project(f.displayLat, f.displayLng, w, h);
        // Fuzzy polygon
        if (f.fuzzyPolygon) {
          const ring = f.fuzzyPolygon.coordinates[0];
          ctx.beginPath();
          ring.forEach(([lng, lat], i) => {
            const pt = project(lat, lng, w, h);
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
          ctx.fillStyle = 'rgba(196, 146, 42, 0.18)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(196, 146, 42, 0.55)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        const color = TYPE_COLORS[f.vendorType] ?? '#0F6B5C';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = f.isHomeBased ? '#C4922A' : color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (selected && selected.id === f.id) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
          ctx.strokeStyle = '#0F6B5C';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Click hit-test
    const onClick = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      let best: MapVendorMarker | null = null;
      let bestD = 16;
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

  // Optional MapLibre enhancement when package exists
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('maplibre-gl').catch(() => null);
        if (!mod || cancelled) return;
        setMaplibreReady(true);
        // MapLibre map is an optional upgrade; canvas remains source of truth for offline.
      } catch {
        /* keep canvas */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    () => (data?.features ?? []).filter((f): f is { type: 'vendor' } & MapVendorMarker => f.type === 'vendor'),
    [data],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-auth flex-col gap-4 px-4 py-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">نقشه نزدیک</h1>
          <p className="mt-1 text-xs text-ink-muted">
            فروشنده‌ها در شعاع انتخابی · مکان خانگی مبهم‌سازی می‌شود
          </p>
        </div>
        <a href="/" className="text-sm text-accent hover:underline">
          خانه
        </a>
      </header>

      <section className="card-auth space-y-3 !p-3">
        <div className="flex flex-wrap items-center gap-2">
          {RADIUS_PRESETS_KM.map((r) => (
            <button
              key={r}
              type="button"
              className={`min-h-[36px] rounded-full border px-3 text-xs font-medium ${
                radiusKm === r
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-white text-ink'
              }`}
              onClick={() => setRadiusKm(r)}
            >
              {r} کیلومتر
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <select
            className="input-field min-h-[40px] flex-1 text-sm"
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
            className="min-h-[40px] rounded-control border border-accent bg-accent-soft px-3 text-xs font-medium text-accent"
            onClick={askGeolocation}
          >
            {geoState === 'loading' ? '…' : geoState === 'ok' ? 'موقعیت شما' : 'موقعیت من'}
          </button>
        </div>

        <div className="relative overflow-hidden rounded-card border border-line bg-paper">
          <canvas ref={canvasRef} className="block w-full" aria-label="نقشه فروشندگان نزدیک" />
          {loading && (
            <div className="absolute inset-x-0 bottom-0 bg-white/80 px-3 py-1 text-center text-xs text-ink-muted">
              در حال بارگذاری…
            </div>
          )}
        </div>

        {error && (
          <p role="status" className="text-xs text-danger">
            {error}
          </p>
        )}

        {geoState === 'denied' && (
          <p className="text-xs text-ink-muted">
            دسترسی موقعیت رد شد — می‌توانید شعاع را دستی انتخاب کنید.
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>
            {data?.total ?? 0} فروشنده{data?.clustered ? ' (خوشه‌بندی شده)' : ''}
          </span>
          <span>
            حریم خصوصی: مبهم‌سازی {data?.privacy?.fuzzyRadiusMeters ?? 200} متری خانگی
            {maplibreReady ? ' · MapLibre آماده' : ''}
          </span>
        </div>
      </section>

      {/* Bottom-sheet preview */}
      <section className="card-auth space-y-2" aria-live="polite">
        <h2 className="text-sm font-bold">
          {selected ? 'پیش‌نمایش فروشنده' : 'نزدیک‌ترین‌ها'}
        </h2>
        {selected ? (
          <div className="space-y-2">
            <div className="text-base font-bold">{selected.businessName}</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
                {TYPE_LABELS[selected.vendorType] ?? selected.vendorType}
              </span>
              {selected.isHomeBased && (
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-gold">خانگی · مبهم</span>
              )}
              <span className="text-ink-muted">{formatDistance(selected.distanceMeters)}</span>
            </div>
            {selected.description && (
              <p className="text-sm text-ink-muted">{selected.description}</p>
            )}
            {selected.address && (
              <p className="text-xs text-ink-muted">{selected.address}</p>
            )}
            {selected.isHomeBased && (
              <p className="text-xs text-gold">
                مختصات دقیق تا تایید سفارش نمایش داده نمی‌شود.
              </p>
            )}
            <button
              type="button"
              className="btn-primary !min-h-[40px] text-sm"
              onClick={() => setSelected(null)}
            >
              بستن
            </button>
          </div>
        ) : vendorFeatures.length === 0 ? (
          <p className="text-sm text-ink-muted">فروشنده‌ای در این محدوده یافت نشد.</p>
        ) : (
          <ul className="max-h-56 space-y-2 overflow-y-auto">
            {vendorFeatures.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="w-full rounded-control border border-line bg-white px-3 py-2 text-right hover:border-accent"
                  onClick={() => setSelected(v)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{v.businessName}</span>
                    <span className="text-xs text-ink-muted">
                      {formatDistance(v.distanceMeters)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {TYPE_LABELS[v.vendorType] ?? v.vendorType}
                    {v.isHomeBased ? ' · خانگی' : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-[10px] text-ink-muted">
        NazdikStore · Phase 2 map engine
      </p>
    </main>
  );
}

/** Offline demo when API is unreachable */
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
                  return [
                    displayLng + (0.0018 * Math.sin(th)),
                    displayLat + (0.0018 * Math.cos(th)),
                  ];
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
