'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

interface FeedItem {
  id: string;
  caption: string;
  createdAt: string;
  businessName: string;
  vendorProfileId: string;
  productTags?: Array<{ productId: string; title: string; priceToman: number }>;
}

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/feed`);
        const body = await res.json();
        if (res.ok && body.success) setItems(body.data);
        else setError('خوراک در دسترس نیست');
      } catch {
        setError('API روی پورت ۴۰۰۰ بالا نیست');
        setItems([
          {
            id: 'd1',
            caption: 'قورمه سبزی امروز آماده است.',
            createdAt: new Date().toISOString(),
            businessName: 'آشپزخانه مادر',
            vendorProfileId: 'vp_food_1',
            productTags: [{ productId: 'p1', title: 'قورمه', priceToman: 185000 }],
          },
        ]);
      }
    })();
  }, []);

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">خوراک محلی</h1>
          <p className="caption">پست‌های فروشندگان نزدیک شما</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <section>
        {items.map((item) => (
          <article key={item.id} className="list-card">
            <Link href={`/vendors/${item.vendorProfileId}`} className="text-accent">
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
        {!error && items.length === 0 && (
          <div className="card body-muted">پستی هنوز منتشر نشده است.</div>
        )}
      </section>

      <Link href="/map" className="btn-secondary">
        مشاهده نقشه
      </Link>
    </main>
  );
}
