'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { EmptyState } from '@/components/empty-state';

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
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await apiFetch<FeedItem[]>('/feed');
      if (!r.ok) {
        setOffline(Boolean(r.offline));
        setError(r.error);
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
        return;
      }
      setItems(r.data || []);
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

      {error && (
        <div className="alert alert-error" role="status">
          {error}
        </div>
      )}

      {items.length === 0 && !error && (
        <EmptyState
          title="هنوز پستی نیست"
          body="فروشنده‌ها می‌توانند از پنل خود پست بگذارند."
          actionHref="/vendor"
          actionLabel="پنل فروشنده"
        />
      )}

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
      </section>

      <Link href="/map" className="btn-secondary">
        مشاهده نقشه
      </Link>
      <Link href="/tour" className="btn-secondary">
        تور دمو
      </Link>
    </main>
  );
}
