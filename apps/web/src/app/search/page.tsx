'use client';

/**
 * Enterprise Phase 12 — Search drawer: debounce 250ms, trending, recent, geo rank.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import {
  TRENDING_TAGS,
  loadRecentSearches,
  pushRecentSearch,
  normalizePersian,
} from '@nazdik/shared';

type Hit = {
  id: string;
  title: string;
  subtitle?: string;
  category?: string;
  textScore: number;
  distanceMeters: number | null;
  rankScore: number;
  isOpenBoost?: boolean;
};

const CAT_FA: Record<string, string> = {
  FOOD: 'غذا',
  MEDICAL: 'پزشکی',
  FIELD_SERVICE: 'خدمات میدانی',
  BEAUTY: 'زیبایی',
  ECOMMERCE: 'فروشگاهی',
};

function fmtDist(m: number | null) {
  if (m == null) return '—';
  return m < 1000 ? `${Math.round(m)} متر` : `${(m / 1000).toFixed(1)} کیلومتر`;
}

const CATS = [
  { key: '', label: 'همه' },
  { key: 'FOOD', label: 'غذا' },
  { key: 'MEDICAL', label: 'پزشکی' },
  { key: 'FIELD_SERVICE', label: 'خدمات' },
  { key: 'BEAUTY', label: 'زیبایی' },
  { key: 'ECOMMERCE', label: 'فروشگاهی' },
];

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [suggestions, setSuggestions] = useState<{ id: string; title: string }[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [normalized, setNormalized] = useState('');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [cat, setCat] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setOrigin({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setOrigin({ lat: 35.6892, lng: 51.389 }),
      { timeout: 5000 },
    );
  }, []);

  const runSearch = useCallback(
    async (query: string) => {
      const qs = new URLSearchParams({ q: query });
      if (origin) {
        qs.set('lat', String(origin.lat));
        qs.set('lng', String(origin.lng));
      }
      const r = await apiFetch<{
        hits: Hit[];
        tookMs: number;
        normalized: string;
      }>(`/search?${qs}`);
      if (r.ok && r.data) {
        setHits(r.data.hits || []);
        setTookMs(r.data.tookMs);
        setNormalized(r.data.normalized);
      }
    },
    [origin],
  );

  const onQueryChange = useCallback(
    (value: string) => {
      setQ(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void runSearch(value);
        void (async () => {
          const r = await apiFetch<{ suggestions: { id: string; title: string }[] }>(
            `/search/autocomplete?q=${encodeURIComponent(value)}`,
          );
          if (r.ok && r.data) setSuggestions(r.data.suggestions || []);
        })();
        if (value.trim()) setRecent(pushRecentSearch(value));
      }, 250);
    },
    [runSearch],
  );

  const filteredHits = useMemo(() => {
    return hits.filter((h) => {
      if (cat && h.category && h.category !== cat) return false;
      if (openOnly && h.isOpenBoost === false) return false;
      return true;
    });
  }, [hits, cat, openOnly]);

      <section className="card stack-3">
        <div className="field">
          <label htmlFor="q">جستجو</label>
          <div className="flex gap-2 items-center">
            <Search style={{ width: 18, height: 18 }} aria-hidden />
            <input
              id="q"
              className="input-field"
              placeholder="مثلاً پیتزا، تعمیر پکیج، پيتزا…"
              value={q}
              onChange={(e) => onQueryChange(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        {normalized && (
          <div className="caption">
            نرمال‌شده: <span className="mono">{normalized}</span>
            {tookMs != null && <> · {tookMs}ms</>}
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                className="pill"
                onClick={() => {
                  setQ(s.title);
                  void runSearch(s.title);
                }}
              >
                {s.title}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card stack-2">
        <h2 className="h2">ترند محلی</h2>
        <div className="radius-row">
          {TRENDING_TAGS.map((t) => (
            <button
              key={t}
              type="button"
              className="pill"
              onClick={() => {
                setQ(t);
                onQueryChange(t);
              }}
            >
              {t}
            </button>
          ))}
        </div>
        {recent.length > 0 && (
          <>
            <h3 className="text-sm font-bold mt-2">جستجوهای اخیر</h3>
            <div className="radius-row">
              {recent.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="pill"
                  onClick={() => {
                    setQ(t);
                    void runSearch(t);
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="stack-3">
        {filteredHits.length === 0 && (
          <div className="card body-muted">نتیجه‌ای نیست — عبارت یا فیلتر را عوض کنید.</div>
        )}
        {filteredHits.map((h) => (
          <div key={h.id} className="list-card stack-2">
            <div className="row-between">
              <div>
                <strong className="text-sm">{h.title}</strong>
                <div className="caption">
                  {h.subtitle || ''} {h.category ? `· ${CAT_FA[h.category] || h.category}` : ''}
                </div>
              </div>
              <div className="price">{(h.rankScore * 100).toFixed(0)}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="tag">متن {(h.textScore * 100).toFixed(0)}%</span>
              <span className="tag tag-line">{fmtDist(h.distanceMeters)}</span>
              {h.isOpenBoost && <span className="tag tag-gold">باز</span>}
              <Link href={`/shop/${h.vendorProfileId || h.id}`} className="tag">
                ویترین
              </Link>
            </div>
          </div>
        ))}
      </section>

      <Link href="/map" className="btn-secondary">
        نقشه
      </Link>
    </main>
  );
}
