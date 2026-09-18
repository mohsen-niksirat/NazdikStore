'use client';

/**
 * C1 — Public vendor storefront (shareable link).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ShopGallery } from '@/components/shop-gallery';

type Shop = {
  id: string;
  businessName: string;
  vendorType: string;
  description: string;
  categoryTags: string[];
  isHomeBased: boolean;
  address: string | null;
  isOpenNow: boolean;
  hours: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  products: Array<{ id: string; title: string; priceToman: number }>;
  posts: Array<{ id: string; caption: string }>;
  reviewSummary: { count: number; average: number };
  reviews: Array<{ id: string; rating: number; body: string | null }>;
  cta: { chat: string; book: string; map: string };
};

const TYPE_FA: Record<string, string> = {
  MEDICAL: 'پزشکی',
  FOOD: 'غذا',
  ECOMMERCE: 'فروشگاهی',
  FIELD_SERVICE: 'خدمات میدانی',
  BEAUTY: 'زیبایی',
};

export default function ShopPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? 'vp_food_1';
  const [shop, setShop] = useState<Shop | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await apiFetch<Shop>(`/shop/${id}`);
      if (!r.ok || !r.data) {
        setErr(r.error || 'ویترین یافت نشد');
        return;
      }
      setShop(r.data);
    })();
  }, [id]);

  if (err || !shop) {
    return (
      <main className="page page-center">
        <div className="card center">
          <p className="body-muted">{err || 'در حال بارگذاری…'}</p>
          <Link href="/" className="btn-secondary mt-3">
            خانه
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="chip-proximity">
          <MapPinIcon />
          {TYPE_FA[shop.vendorType] || shop.vendorType}
          {shop.isOpenNow ? ' · باز' : ' · بسته'}
        </div>
        <h1 className="mt-3">{shop.businessName}</h1>
        <p>{shop.description || 'فروشنده محلی نزدیک شما'}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          {shop.isHomeBased && <span className="tag tag-gold">خانگی · مبهم‌سازی موقعیت</span>}
          <span className="tag" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}>
            امتیاز {shop.reviewSummary.average} · {shop.reviewSummary.count} نظر
          </span>
        </div>
      </section>

      <section className="btn-row">
        <Link href={shop.cta.map} className="btn-primary">
          مسیر روی نقشه
        </Link>
        <Link href={shop.cta.book} className="btn-secondary">
          رزرو نوبت
        </Link>
        <Link href={shop.cta.chat} className="btn-secondary">
          پیام به فروشنده
        </Link>
      </section>

      {shop.address && (
        <section className="card caption">نشانی: {shop.address}</section>
      )}

      <ShopGallery
        title="گالری"
        items={[
          { id: 'g1', label: shop.businessName, hue: '#0d7a66' },
          { id: 'g2', label: 'فضای کار', hue: '#c9972b' },
          { id: 'g3', label: 'محصول ویژه', hue: '#3d5a80' },
        ]}
      />

      {shop.products.length > 0 && (
        <section className="stack-2">
          <h2 className="h2 mb-2">محصولات</h2>
          {shop.products.map((p) => (
            <div key={p.id} className="list-card row-between">
              <span className="text-sm font-bold">{p.title}</span>
              <span className="price">{p.priceToman.toLocaleString('fa-IR')}</span>
            </div>
          ))}
        </section>
      )}

      {shop.posts.length > 0 && (
        <section className="stack-2">
          <h2 className="h2 mb-2">آخرین پست‌ها</h2>
          {shop.posts.map((p) => (
            <div key={p.id} className="list-card">
              <p className="text-sm">{p.caption}</p>
            </div>
          ))}
        </section>
      )}

      {shop.reviews.length > 0 && (
        <section className="stack-2">
          <h2 className="h2 mb-2">نظر مشتریان</h2>
          {shop.reviews.map((r) => (
            <div key={r.id} className="list-card">
              <div className="row-between text-sm">
                <span className="rating">
                  <StarIcon /> {r.rating}
                </span>
              </div>
              {r.body && <p className="body-muted text-sm mt-1">{r.body}</p>}
            </div>
          ))}
        </section>
      )}

      <Link href={`/vendors/${shop.id}`} className="btn-ghost mx-auto">
        نمای پروفایل کامل
      </Link>
    </main>
  );
}

function MapPinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3l2.7 5.5 6 .9-4.4 4.3 1 6.1L12 17.2 6.7 19.8l1-6.1L3.3 9.4l6-.9L12 3z" />
    </svg>
  );
}
