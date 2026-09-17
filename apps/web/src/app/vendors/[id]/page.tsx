'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BadgeCheck, MapPin, Star } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
  reply: { body: string; createdAt: string } | null;
}

interface VendorProfile {
  id: string;
  businessName: string;
  vendorType: string;
  categoryTags: string[];
  description: string | null;
  verificationStatus: string;
  isHomeBased: boolean;
  socialLinks: Record<string, string>;
  location: {
    displayLat: number;
    displayLng: number;
    address: string | null;
    isHomeBased: boolean;
  } | null;
  posts: Array<{
    id: string;
    caption: string;
    createdAt: string;
    images: Array<{ id: string; url: string; altText: string | null }>;
    productTags: Array<{ productId: string; title: string; priceToman: number }>;
  }>;
  products: Array<{
    id: string;
    title: string;
    description: string | null;
    priceToman: number;
    currency: string;
    stock: number | null;
  }>;
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
        } else {
          setError(pBody.error?.message ?? 'پروفایل یافت نشد');
        }
      } catch {
        if (!cancelled) {
          setError('سرور در دسترس نیست — داده نمونه نمایش داده می‌شود');
          setProfile(demoProfile(id));
          setReviews(demoReviews());
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error && !profile) {
    return (
      <main className="mx-auto max-w-auth px-4 py-10 text-center text-sm text-danger">{error}</main>
    );
  }
  if (!profile) {
    return (
      <main className="mx-auto max-w-auth px-4 py-10 text-center text-sm text-ink-muted">
        در حال بارگذاری…
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-auth flex-col gap-4 px-4 py-6">
      <header className="card-auth space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{profile.businessName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">
                {TYPE_LABELS[profile.vendorType] ?? profile.vendorType}
              </span>
              {profile.verificationStatus === 'VERIFIED' && (
                <span className="inline-flex items-center gap-1 text-gold">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                  تایید شده
                </span>
              )}
              {profile.isHomeBased && (
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-gold">خانگی</span>
              )}
            </div>
          </div>
          <a href="/map" className="text-sm text-accent hover:underline">
            نقشه
          </a>
        </div>

        {profile.description && (
          <p className="text-sm leading-7 text-ink-muted">{profile.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {profile.categoryTags.map((t) => (
            <span key={t} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
              {t}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
          <div className="inline-flex items-center gap-1">
            <Star className="h-4 w-4 fill-gold text-gold" aria-hidden />
            <span className="font-medium">{profile.reviewSummary.average || '—'}</span>
            <span className="text-ink-muted">({profile.reviewSummary.count} نظر)</span>
          </div>
          {profile.location && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {profile.location.address ?? 'روی نقشه'}
              {profile.location.isHomeBased ? ' · مبهم' : ''}
            </span>
          )}
        </div>
      </header>

      {error && (
        <p className="text-xs text-danger" role="status">
          {error}
        </p>
      )}

      <nav className="flex gap-2" role="tablist" aria-label="بخش‌ها">
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
            className={`min-h-[40px] flex-1 rounded-control border text-sm font-medium ${
              tab === key
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line bg-white text-ink'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'posts' && (
        <section className="space-y-3">
          {profile.posts.length === 0 && (
            <p className="card-auth text-sm text-ink-muted">هنوز پستی منتشر نشده است.</p>
          )}
          {profile.posts.map((post) => (
            <article key={post.id} className="card-auth space-y-2">
              <p className="text-sm leading-7">{post.caption}</p>
              {post.images.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {post.images.map((img) => (
                    <div
                      key={img.id}
                      className="flex aspect-square items-center justify-center rounded-control border border-line bg-accent-soft/40 text-[10px] text-ink-muted"
                      aria-label={img.altText ?? 'تصویر پست'}
                    >
                      تصویر
                    </div>
                  ))}
                </div>
              )}
              {post.productTags.length > 0 && (
                <ul className="space-y-1 border-t border-line pt-2">
                  {post.productTags.map((t) => (
                    <li key={t.productId} className="flex justify-between text-xs">
                      <span>{t.title}</span>
                      <span className="text-accent">{toman(t.priceToman)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <time className="block text-[10px] text-ink-muted">
                {new Date(post.createdAt).toLocaleDateString('fa-IR')}
              </time>
            </article>
          ))}
        </section>
      )}

      {tab === 'products' && (
        <section className="space-y-2">
          {profile.products.length === 0 && (
            <p className="card-auth text-sm text-ink-muted">محصولی ثبت نشده است.</p>
          )}
          {profile.products.map((p) => (
            <div key={p.id} className="card-auth flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{p.title}</div>
                {p.description && (
                  <div className="mt-0.5 text-xs text-ink-muted">{p.description}</div>
                )}
                {p.stock != null && (
                  <div className="mt-1 text-[11px] text-ink-muted">موجودی: {p.stock}</div>
                )}
              </div>
              <div className="whitespace-nowrap text-sm font-bold text-accent">
                {toman(p.priceToman)}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'reviews' && (
        <section className="space-y-2">
          <p className="text-xs text-ink-muted">
            فقط مشتریان با سفارش یا نوبت تکمیل‌شده می‌توانند نظر ثبت کنند.
          </p>
          {reviews.length === 0 && (
            <p className="card-auth text-sm text-ink-muted">هنوز نظر تاییدشده‌ای ثبت نشده است.</p>
          )}
          {reviews.map((r) => (
            <div key={r.id} className="card-auth space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{r.consumerLabel}</span>
                <span className="inline-flex items-center gap-0.5 text-sm">
                  <Star className="h-3.5 w-3.5 fill-gold text-gold" aria-hidden />
                  {r.rating}
                </span>
              </div>
              {r.body && <p className="text-sm leading-7 text-ink-muted">{r.body}</p>}
              {r.reply && (
                <div className="rounded-control border border-line bg-accent-soft/30 p-2 text-xs leading-6">
                  <span className="font-medium text-accent">پاسخ فروشنده: </span>
                  {r.reply.body}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      <a href="/" className="text-center text-sm text-ink-muted hover:text-ink">
        بازگشت به خانه
      </a>
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
    socialLinks: {},
    location: {
      displayLat: 35.6928,
      displayLng: 51.3925,
      address: 'منطقه ۶ — محدوده',
      isHomeBased: true,
    },
    posts: [
      {
        id: 'p1',
        caption: 'قورمه سبزی امروز — برای ۲۰ نفر آماده می‌شود.',
        createdAt: new Date().toISOString(),
        images: [{ id: 'i1', url: '', altText: 'قورمه' }],
        productTags: [{ productId: 'prod1', title: 'قورمه سبزی', priceToman: 185000 }],
      },
    ],
    products: [
      {
        id: 'prod1',
        title: 'قورمه سبزی خانگی',
        description: 'پرسی با برنج',
        priceToman: 185000,
        currency: 'IRR',
        stock: 20,
      },
    ],
    reviewSummary: { count: 2, average: 4.5 },
  };
}

function demoReviews(): Review[] {
  return [
    {
      id: 'r1',
      rating: 5,
      body: 'خیلی خوشمزه و به‌موقع.',
      createdAt: new Date().toISOString(),
      consumerLabel: '0912 *** 6789',
      reply: null,
    },
  ];
}
