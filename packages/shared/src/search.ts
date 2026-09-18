/**
 * Enterprise Phase 12 — Persian normalization, fuzzy match, geo-ranking.
 */

/** Unify Arabic vs Persian letters, strip diacritics, normalize half-space */
export function normalizePersian(input: string): string {
  if (!input) return '';
  let s = String(input);
  // Arabic Yeh/Kaf → Persian
  s = s.replace(/[يئ]/g, 'ی').replace(/[كک]/g, 'ک');
  // Arabic diacritics / tatweel / ZWNJ normalize
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  // half-space ZWNJ → regular space-ish then collapse
  s = s.replace(/\u200c/g, '‌'); // keep half-space as ZWNJ for some, but for search use space
  s = s.replace(/\u200c/g, ' ');
  // Arabic digits → Latin
  s = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  s = s.toLowerCase();
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Tokenize for bag-of-words match */
export function tokenizePersian(input: string): string[] {
  const n = normalizePersian(input);
  return n
    .split(/[\s،,،.\-_/\\|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Similarity 0..1 — combines token overlap + bigram Dice coefficient (pg_trgm-like).
 */
export function textSimilarity(a: string, b: string): number {
  const na = normalizePersian(a);
  const nb = normalizePersian(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(tokenizePersian(na));
  const tb = new Set(tokenizePersian(nb));
  let inter = 0;
  for (const t of ta) if (tb.has(t) || [...tb].some((u) => u.includes(t) || t.includes(u))) inter += 1;
  const tokenScore = ta.size ? inter / Math.max(ta.size, tb.size) : 0;

  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(na.replace(/\s/g, ''));
  const bb = bigrams(nb.replace(/\s/g, ''));
  let hit = 0;
  for (const g of ba) if (bb.has(g)) hit += 1;
  const dice = ba.size + bb.size ? (2 * hit) / (ba.size + bb.size) : 0;

  // substring boost
  let sub = 0;
  if (na.includes(nb) || nb.includes(na)) sub = 0.35;

  return Math.min(1, 0.45 * tokenScore + 0.35 * dice + sub);
}

export interface SearchDoc {
  id: string;
  title: string;
  subtitle?: string;
  category?: string;
  categoryTags?: string[];
  lat?: number;
  lng?: number;
  rating?: number;
  /** operating minutes or null */
  openFromMinute?: number | null;
  openToMinute?: number | null;
  isOpenNow?: boolean;
  vendorProfileId?: string;
}

export interface GeoRankWeights {
  relevance: number;
  distance: number;
  rating: number;
}

export const DEFAULT_RANK_WEIGHTS: GeoRankWeights = {
  relevance: 0.5,
  distance: 0.35,
  rating: 0.15,
};

function proximityScore(distM: number | null): number {
  if (distM == null || !Number.isFinite(distM)) return 0.4;
  // 0m → 1, 10km → 0
  return Math.max(0, Math.min(1, 1 - distM / 10000));
}

function trustScore(rating?: number): number {
  if (rating == null || !Number.isFinite(rating)) return 0.5;
  return Math.max(0, Math.min(1, rating / 5));
}

function openScore(doc: SearchDoc): number {
  if (doc.isOpenNow != null) return doc.isOpenNow ? 1 : 0.15;
  return 0.7;
}

export interface RankedHit extends SearchDoc {
  textScore: number;
  distanceMeters: number | null;
  rankScore: number;
  isOpenBoost: boolean;
}

export function geoRankSearch(
  query: string,
  docs: SearchDoc[],
  opts?: {
    origin?: { lat: number; lng: number };
    maxDistanceM?: number;
    weights?: Partial<GeoRankWeights>;
    haversine?: (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => number;
  },
): RankedHit[] {
  const w = { ...DEFAULT_RANK_WEIGHTS, ...(opts?.weights || {}) };
  const haversine =
    opts?.haversine ||
    ((a, b) => {
      const R = 6371000;
      const toR = (d: number) => (d * Math.PI) / 180;
      const dLat = toR(b.lat - a.lat);
      const dLng = toR(b.lng - a.lng);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    });

  const origin = opts?.origin;
  const maxD = opts?.maxDistanceM;

  const scored = docs
    .map((doc) => {
      const haystack = [doc.title, doc.subtitle, doc.category, ...(doc.categoryTags || [])]
        .filter(Boolean)
        .join(' ');
      const textScore = textSimilarity(query, haystack);
      let distanceMeters: number | null = null;
      if (origin && doc.lat != null && doc.lng != null) {
        distanceMeters = haversine(origin, { lat: doc.lat, lng: doc.lng });
      }
      const isOpen = openScore(doc);
      const rankScore =
        w.relevance * textScore +
        w.distance * proximityScore(distanceMeters) +
        w.rating * trustScore(doc.rating) +
        0.1 * isOpen;
      return {
        ...doc,
        textScore,
        distanceMeters,
        rankScore,
        isOpenBoost: isOpen === 1,
      };
    })
    .filter((r) => r.textScore > 0.12 || normalizePersian(query).length === 0)
    .filter((r) => {
      if (maxD == null || r.distanceMeters == null) return true;
      return r.distanceMeters <= maxD;
    })
    .sort((a, b) => {
      // open businesses first when scores close
      if (a.isOpenBoost !== b.isOpenBoost && Math.abs(a.rankScore - b.rankScore) < 0.08) {
        return a.isOpenBoost ? -1 : 1;
      }
      return b.rankScore - a.rankScore;
    });

  return scored;
}

export interface AutocompleteResult {
  id: string;
  title: string;
  subtitle?: string;
  rankScore: number;
}

export function autocomplete(query: string, docs: SearchDoc[], limit = 8): AutocompleteResult[] {
  return geoRankSearch(query, docs)
    .slice(0, limit)
    .map((d) => ({
      id: d.id,
      title: d.title,
      subtitle: d.subtitle,
      rankScore: d.rankScore,
    }));
}

export const RECENT_SEARCH_KEY = 'nazdik_recent_searches';
export const TRENDING_TAGS = [
  'پیتزا',
  'نان سنگک',
  'تعمیر پکیج',
  'آرایشگاه',
  'دندانپزشکی',
  'خشکشویی',
  'گل فروشی',
];

export function loadRecentSearches(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
  } catch {
    return [];
  }
}

export function pushRecentSearch(q: string, max = 8): string[] {
  const n = normalizePersian(q);
  if (!n) return loadRecentSearches();
  const list = [n, ...loadRecentSearches().filter((x) => x !== n)].slice(0, max);
  try {
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

export const PRODUCTION_SEARCH_PHASE = 12;
