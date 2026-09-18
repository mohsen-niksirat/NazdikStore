'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

type Intent = {
  category: string | null;
  tags: string[];
  status: string;
  maxDistanceKm: number | null;
  normalized: string;
};

const CAT_FA: Record<string, string> = {
  MEDICAL: 'پزشکی',
  FOOD: 'غذا',
  FIELD_SERVICE: 'خدمات میدانی',
  BEAUTY: 'زیبایی',
  ECOMMERCE: 'فروشگاهی',
};

const SAMPLES = [
  'تعمیرکار پکیج نزدیک من که الان باز باشه',
  'پیتزای خونگی نزدیک',
  'دکتر دندان تا ۳ کیلومتر',
];

export default function AssistantPage() {
  const [q, setQ] = useState(SAMPLES[0]);
  const [result, setResult] = useState<{
    source: string;
    intent: Intent;
    searchParams: Record<string, string>;
  } | null>(null);
  const [faqQ, setFaqQ] = useState('هزینه ایاب و ذهاب چقدر است؟');
  const [faq, setFaq] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const r = await apiFetch<{ source: string; intent: Intent; searchParams: Record<string, string> }>(
      '/assistant/query',
      { method: 'POST', body: JSON.stringify({ query: q }) },
    );
    setBusy(false);
    if (!r.ok || !r.data) {
      setErr(r.error || 'دستیار در دسترس نیست');
      return;
    }
    setResult(r.data);
  }, [q]);

  const askFaq = useCallback(async () => {
    const r = await apiFetch<{ reply: string | null; matched: boolean }>('/assistant/faq', {
      method: 'POST',
      body: JSON.stringify({ message: faqQ }),
    });
    setFaq(r.ok ? r.data?.reply || 'پاسخ خودکاری یافت نشد' : r.error || 'خطا');
  }, [faqQ]);

  useEffect(() => {
    void askFaq();
  }, [askFaq]);

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">دستیار نزدیک</h1>
          <p className="caption">فاز ۱۵ · جستجوی محاوره‌ای فارسی</p>
        </div>
        <Link href="/search" className="btn-ghost">
          جستجوی پیشرفته
        </Link>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <section className="card stack-3">
        <div className="field">
          <label htmlFor="a">بگو چه می‌خواهی</label>
          <textarea
            id="a"
            className="input-field"
            style={{ minHeight: 80, paddingTop: 10 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="radius-row">
          {SAMPLES.map((s) => (
            <button key={s} type="button" className="pill" onClick={() => setQ(s)}>
              {s.slice(0, 16)}…
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary" disabled={busy || !q.trim()} onClick={() => void ask()}>
          {busy ? 'در حال تحلیل…' : 'تحلیل درخواست'}
        </button>
        {result && (
          <div className="alert alert-muted stack-2">
            <div className="caption">
              موتور: {result.source === 'local' ? 'محلی (بدون AI خارجی)' : 'خارجی'}
            </div>
            <div className="text-sm">
              دسته:{' '}
              <strong>
                {result.intent.category ? CAT_FA[result.intent.category] || result.intent.category : '—'}
              </strong>
              {result.intent.status === 'OPEN' && <span className="tag tag-gold">باز الان</span>}
              {result.intent.maxDistanceKm && (
                <span className="tag">شعاع {result.intent.maxDistanceKm} کیلومتر</span>
              )}
            </div>
            {result.intent.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {result.intent.tags.map((t) => (
                  <span key={t} className="tag tag-line">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="caption mono" dir="ltr">
              {JSON.stringify(result.searchParams)}
            </div>
            <Link href={`/search?q=${encodeURIComponent(result.intent.tags[0] || q)}`} className="btn-secondary">
              جستجوی نتایج
            </Link>
          </div>
        )}
      </section>

      <section className="card stack-3">
        <h2 className="h2">پاسخ خودکار فروشنده (FAQ)</h2>
        <div className="field">
          <label>پیام مشتری</label>
          <input className="input-field" value={faqQ} onChange={(e) => setFaqQ(e.target.value)} />
        </div>
        <button type="button" className="btn-secondary" onClick={() => void askFaq()}>
          دریافت پاسخ
        </button>
        {faq && <div className="alert alert-ok">{faq}</div>}
      </section>

      <Link href="/" className="btn-secondary">
        خانه
      </Link>
    </main>
  );
}
