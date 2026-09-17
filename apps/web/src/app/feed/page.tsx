'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface FeedItem {
  id: string;
  caption: string;
  createdAt: string;
  businessName: string;
  vendorProfileId: string;
  images: Array<{ id: string; url: string }>;
  productTags: Array<{ productId: string; title: string; priceToman: number }>;
}

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/feed`);
        const body = await res.json();
        if (res.ok && body.success) {
          setItems(body.data);
        } else {
          setError('خوراک در دسترس نیست');
        }
      } catch {
        setError('سرور در دسترس نیست');
        setItems([
          {
            id: 'd1',
            caption: 'قورمه سبزی امروز آماده است.',
            createdAt: new Date().toISOString(),
            businessName: 'آشپزخانه مادر',
            vendorProfileId: 'vp_food_1',
            images: [],
            productTags: [{ productId: 'p1', title: 'قورمه', priceToman: 185000 }],
          },
        ]);
      }
    })();
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-auth flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">خوراک محلی</h1>
          <p className="text-xs text-ink-muted">پست‌های فروشندگان نزدیک شما</p>
        </div>
        <Link href="/" className="text-sm text-accent hover:underline">
          خانه
        </Link>
      </header>

      {error && <p className="text-xs text-danger">{error}</p>}

      <section className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="card-auth space-y-2">
            <Link
              href={`/vendors/${item.vendorProfileId}`}
              className="text-sm font-bold text-accent hover:underline"
            >
              {item.businessName}
            </Link>
            <p className="text-sm leading-7">{item.caption}</p>
            {item.productTags.length > 0 && (
              <ul className="text-xs text-ink-muted">
                {item.productTags.map((t) => (
                  <li key={t.productId} className="flex justify-between">
                    <span>{t.title}</span>
                    <span>{t.priceToman.toLocaleString('fa-IR')} تومان</span>
                  </li>
                ))}
              </ul>
            )}
            <time className="block text-[10px] text-ink-muted">
              {new Date(item.createdAt).toLocaleDateString('fa-IR')}
            </time>
          </article>
        ))}
        {!error && items.length === 0 && (
          <p className="card-auth text-sm text-ink-muted">پستی هنوز منتشر نشده است.</p>
        )}
      </section>
    </main>
  );
}
