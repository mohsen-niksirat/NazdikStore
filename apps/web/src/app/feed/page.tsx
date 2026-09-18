'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

const CATS = [
  { key: '', label: 'همه' },
  { key: 'FOOD', label: 'غذا' },
  { key: 'MEDICAL', label: 'پزشکی' },
  { key: 'FIELD_SERVICE', label: 'خدمات' },
  { key: 'BEAUTY', label: 'زیبایی' },
];

type FeedItem = {
  id: string;
  caption: string;
  createdAt: string;
  businessName: string;
  vendorProfileId: string;
  productTags?: Array<{ productId: string; title: string; priceToman: number }>;
};

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cat, setCat] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await apiFetch<FeedItem[]>('/feed');
      if (!r.ok) {
        setError(r.error || null);
        setItems([]);
        return;
      }
      setItems(r.data || []);
    })();
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <div className="chip-proximity">خوراک محلی</div>
        <h1 className="mt-3">چه خبر از اطراف شما؟</h1>
        <p>پست‌های تازه فروشنده‌ها — برای ویترین کامل روی نام آن‌ها بزن.</p>
      </section>

      <div className="radius-row">
        {CATS.map((c) => (
          <button
            key={c.key || 'all'}
            type="button"
            className={`pill${cat === c.key ? ' active' : ''}`}
            onClick={() => setCat(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!error && items.length === 0 && (
        <EmptyState
          title="خوراک خالی است"
          body="فروشنده‌ها پست می‌گذارند تا اینجا دیده شوند."
          actionHref="/map"
          actionLabel="کشف روی نقشه"
        />
      )}

      <section>
        {items.map((item) => (
          <article key={item.id} className="list-card">
            <Link href={`/shop/${item.vendorProfileId}`} className="text-accent">
              {item.businessName}
            </Link>
            <p className="mt-2 text-sm leading-7">{item.caption}</p>
            {item.productTags && item.productTags.length > 0 && (
              <ul className="list-none mt-2">
                {item.productTags.map((t) => (
                  <li key={t.productId} className="row-between text-xs text-muted">
                    <span>{t.title}</span>
                    <span className="price">{t.priceToman.toLocaleString('fa-IR')} تومان</span>
                  </li>
                ))}
              </ul>
            )}
            <time className="caption block mt-2">
              {new Date(item.createdAt).toLocaleDateString('fa-IR')}
            </time>
          </article>
        ))}
      </section>

      <Link href="/map" className="btn-secondary">
        نقشه نزدیک
      </Link>
    </main>
  );
}
