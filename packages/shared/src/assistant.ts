/**
 * Enterprise Phase 15 — Persian NLP intent matcher + graceful AI fallback.
 */

export interface AssistantIntent {
  category: string | null;
  tags: string[];
  status: 'OPEN' | 'ANY';
  maxDistanceKm: number | null;
  raw: string;
  normalized: string;
}

const CATEGORY_KEYWORDS: Array<{ key: string; words: string[] }> = [
  { key: 'FIELD_SERVICE', words: ['تعمیر', 'تعمیرکار', 'لوله', 'برق', 'پکیج', 'کولر', 'سرویس', 'مکانیک', 'بنزینی'] },
  { key: 'MEDICAL', words: ['پزشک', 'دکتر', 'مطب', 'دندان', 'درمانگاه', 'ویزیت'] },
  { key: 'FOOD', words: ['غذا', 'پیتزا', 'کباب', 'رستوران', 'نان', 'آشپزخانه', 'شیرینی', 'کافه'] },
  { key: 'BEAUTY', words: ['آرایش', 'آرایشگاه', 'سالن', 'زیبایی', 'ناخن', 'مو'] },
  { key: 'ECOMMERCE', words: ['فروشگاه', 'بوتیک', 'پوشاک', 'لوازم'] },
];

export function normalizeQuery(q: string): string {
  return String(q || '')
    .replace(/[يئ]/g, 'ی')
    .replace(/[كک]/g, 'ک')
    .replace(/[\u064B-\u065F\u0640]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePersianIntent(query: string): AssistantIntent {
  const n = normalizeQuery(query);
  let category: string | null = null;
  const tags: string[] = [];

  for (const row of CATEGORY_KEYWORDS) {
    for (const w of row.words) {
      if (n.includes(w)) {
        category = row.key;
        tags.push(w);
        break;
      }
    }
    if (category) break;
  }

  // extra product tags
  const tagWords = ['پکیج', 'پیتزا', 'نان', 'کولر', 'لوله', 'دندان', 'مو'];
  for (const t of tagWords) {
    if (n.includes(t) && !tags.includes(t)) tags.push(t);
  }

  const status: 'OPEN' | 'ANY' =
    n.includes('الان باز') || n.includes('الان باشه') || n.includes('باز باشه') || n.includes('الان')
      ? 'OPEN'
      : 'ANY';

  let maxDistanceKm: number | null = null;
  const km = n.match(/(\d+(?:\.\d+)?)\s*(?:کیلومتر|km)/);
  if (km) maxDistanceKm = Number(km[1]);
  else if (n.includes('نزدیک')) maxDistanceKm = n.includes('خیلی نزدیک') ? 2 : 5;

  return { category, tags, status, maxDistanceKm, raw: query, normalized: n };
}

export function intentToSearchParams(intent: AssistantIntent): Record<string, string> {
  const out: Record<string, string> = {};
  if (intent.category) out.vendorType = intent.category;
  if (intent.maxDistanceKm) out.radiusKm = String(intent.maxDistanceKm);
  if (intent.tags[0]) out.q = intent.tags[0];
  out.openNow = intent.status === 'OPEN' ? '1' : '0';
  return out;
}

/** Lightweight image → category tags (stub classifier) */
export function classifyImageTags(filenameOrMime: string): {
  suggestedCategory: string;
  tags: string[];
} {
  const s = String(filenameOrMime || '').toLowerCase();
  if (s.includes('car') || s.includes('dent') || s.includes('ماشین')) {
    return { suggestedCategory: 'FIELD_SERVICE', tags: ['بدنه‌خودرو', 'صافکاری'] };
  }
  if (s.includes('boiler') || s.includes('پکیج') || s.includes('ac')) {
    return { suggestedCategory: 'FIELD_SERVICE', tags: ['پکیج', 'تهویه'] };
  }
  if (s.includes('hair') || s.includes('salon')) {
    return { suggestedCategory: 'BEAUTY', tags: ['مو'] };
  }
  return { suggestedCategory: 'FIELD_SERVICE', tags: ['سرویس در محل'] };
}

export interface FaqRule {
  keywords: string[];
  reply: string;
}

export const DEFAULT_VENDOR_FAQ: FaqRule[] = [
  {
    keywords: ['ایاب', 'ذهاب', 'رفت', 'آمد', 'حمل و نقل'],
    reply: 'هزینه ایاب و ذهاب بر اساس فاصله محاسبه می‌شود (تا ۵ کیلومتر رایگان).',
  },
  {
    keywords: ['ساعت', 'باز', 'تعطیل'],
    reply: 'ساعات کاری را در بخش نوبت‌دهی مشاهده کنید.',
  },
  {
    keywords: ['قیمت', 'هزینه', 'چند'],
    reply: 'قیمت پس از بررسی مشکل اعلام می‌شود؛ می‌توانید درخواست خدمت ثبت کنید.',
  },
];

export function vendorAutoReply(message: string, faq: FaqRule[] = DEFAULT_VENDOR_FAQ): string | null {
  const n = normalizeQuery(message);
  for (const rule of faq) {
    if (rule.keywords.some((k) => n.includes(normalizeQuery(k)))) return rule.reply;
  }
  return null;
}

/** Graceful degradation when external AI is down */
export async function assistantQuery(
  query: string,
  deps?: {
    externalParse?: (q: string) => Promise<AssistantIntent>;
  },
): Promise<{ source: 'local' | 'external'; intent: AssistantIntent }> {
  try {
    if (deps?.externalParse) {
      const ext = await deps.externalParse(query);
      if (ext) return { source: 'external', intent: ext };
    }
  } catch {
    /* fall through */
  }
  return { source: 'local', intent: parsePersianIntent(query) };
}

export const PRODUCTION_ASSISTANT_PHASE = 15;
