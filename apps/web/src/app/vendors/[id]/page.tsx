'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BadgeCheck, MapPin, Star } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

const TYPE_LABELS: Record<string, string> = {
  MEDICAL: 'پزشکی',
  FOOD: 'غذا',
  ECOMMERCE: 'فروشگاهی',
  FIELD_SERVICE: 'خدمات میدانی',
  BEAUTY: 'زیبایی',
};

interface Review {
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  consumerLabel: string;
  reply: { body: string } | null;
}

interface VendorProfile {
  id: string;
  businessName: string;
  vendorType: string;
  categoryTags: string[];
  description: string | null;
  verificationStatus: string;
  isHomeBased: boolean;
  location: { displayLat: number; displayLng: number; address: string | null; isHomeBased: boolean } | null;
  posts: Array<{ id: string; caption: string; createdAt: string; productTags: Array<{ productId: string; title: string; priceToman: number }> }>;
  products: Array<{ id: string; title: string; description: string | null; priceToman: number; stock: number | null }>;
  reviewSummary: { count: number; average: number };
}

function toman(n: number): string {
  return `${n.toLocaleString('fa-IR')} تومان`;
}

export default function VendorProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? 'vp_food_1';
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'posts' | 'products' | 'reviews'>('posts');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, rRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/vendors/${id}/profile`),
          fetch(`${API_URL}/api/v1/vendors/${id}/reviews`),
        ]);
        const pBody = await pRes.json();
        const rBody = await rRes.json();
        if (cancelled) return;
        if (pRes.ok && pBody.success) {
          setProfile(pBody.data);
          setReviews(rBody.success ? rBody.data : []);
        } else setError(pBody.error?.message ?? 'پروفایل یافت نشد');
      } catch {
        if (!cancelled) {
          setError('API در دسترس نیست — داده نمونه');
          setProfile(demoProfile(id));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error && !profile) {
    return (
      <main className="page page-center">
        <div className="card alert alert-error center">{error}</div>
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="page page-center">
        <div className="card body-muted center">در حال بارگذاری…</div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">{profile.businessName}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="tag">{TYPE_LABELS[profile.vendorType] ?? profile.vendorType}</span>
            {profile.verificationStatus === 'VERIFIED' && (
              <span className="tag tag-gold">
                <BadgeCheck style={{ width: 12, height: 12 }} aria-hidden /> تایید شده
              </span>
            )}
            {profile.isHomeBased && <span className="tag tag-gold">خانگی</span>}
          </div>
        </div>
        <Link href="/map" className="btn-ghost">
          نقشه
        </Link>
      </div>

      <section className="card card-hero stack-3">
        {profile.description && <p className="body-muted">{profile.description}</p>}
        <div className="flex flex-wrap gap-2">
          {profile.categoryTags.map((t) => (
            <span key={t} className="tag tag-line">
              {t}
            </span>
          ))}
        </div>
        <div className="row-between" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <span className="rating">
            <Star aria-hidden />
            {profile.reviewSummary.average || '—'}
            <span className="caption">({profile.reviewSummary.count} نظر)</span>
          </span>
          {profile.location && (
            <span className="caption flex items-center gap-1">
              <MapPin style={{ width: 14, height: 14 }} aria-hidden />
              {profile.location.address ?? 'روی نقشه'}
              {profile.location.isHomeBased ? ' · مبهم' : ''}
            </span>
          )}
        </div>
      </section>

      <div className="tabs" role="tablist">
        {(
          [
            ['posts', 'پست‌ها'],
            ['products', 'کاتالوگ'],
            ['reviews', 'نظرات'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'posts' && (
        <section>
          {profile.posts.length === 0 && <div className="card body-muted">هنوز پستی منتشر نشده است.</div>}
          {profile.posts.map((post) => (
            <article key={post.id} className="list-card">
              <p className="text-sm leading-7">{post.caption}</p>
              {post.productTags?.length > 0 && (
                <ul className="list-none mt-2">
                  {post.productTags.map((t) => (
                    <li key={t.productId} className="row-between text-xs">
                      <span>{t.title}</span>
                      <span className="price">{toman(t.priceToman)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <time className="caption block mt-2">
                {new Date(post.createdAt).toLocaleDateString('fa-IR')}
              </time>
            </article>
          ))}
        </section>
      )}

      {tab === 'products' && (
        <section>
          {profile.products.length === 0 && <div className="card body-muted">محصولی ثبت نشده است.</div>}
          {profile.products.map((p) => (
            <div key={p.id} className="list-card row-between">
              <div>
                <div className="font-bold">{p.title}</div>
                {p.description && <div className="caption mt-1">{p.description}</div>}
                {p.stock != null && <div className="caption">موجودی: {p.stock}</div>}
              </div>
              <div className="price">{toman(p.priceToman)}</div>
            </div>
          ))}
        </section>
      )}

      {tab === 'reviews' && (
        <section>
          <div className="alert alert-muted">
            فقط مشتریان با سفارش یا نوبت تکمیل‌شده می‌توانند نظر ثبت کنند.
          </div>
          {reviews.length === 0 && (
            <div className="list-card body-muted">هنوز نظر تاییدشده‌ای ثبت نشده است.</div>
          )}
          {reviews.map((r) => (
            <div key={r.id} className="list-card">
              <div className="row-between">
                <span className="font-medium">{r.consumerLabel}</span>
                <span className="rating">
                  <Star aria-hidden />
                  {r.rating}
                </span>
              </div>
              {r.body && <p className="body-muted mt-2">{r.body}</p>}
              {r.reply && (
                <div className="reply-box">
                  <strong className="text-accent">پاسخ فروشنده: </strong>
                  {r.reply.body}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <Link href="/" className="btn-secondary">
        بازگشت به خانه
      </Link>
    </main>
  );
}

function demoProfile(id: string): VendorProfile {
  return {
    id,
    businessName: 'آشپزخانه مادر',
    vendorType: 'FOOD',
    categoryTags: ['home-chef', 'ghorme'],
    description: 'غذای خانگی ایرانی — نزدیک شما',
    verificationStatus: 'VERIFIED',
    isHomeBased: true,
    location: { displayLat: 35.69, displayLng: 51.39, address: 'منطقه ۶ — محدوده', isHomeBased: true },
    posts: [
      {
        id: 'p1',
        caption: 'قورمه سبزی امروز آماده است.',
        createdAt: new Date().toISOString(),
        productTags: [{ productId: 'prod1', title: 'قورمه سبزی', priceToman: 185000 }],
      },
    ],
    products: [
      { id: 'prod1', title: 'قورمه سبزی خانگی', description: 'پرسی با برنج', priceToman: 185000, stock: 20 },
    ],
    reviewSummary: { count: 2, average: 4.5 },
  };
}
