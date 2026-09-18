'use client';

/**
 * v1.9 — In-app demo tour for reviewers.
 * Live API health + ordered walkthrough with deep links.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

type Health = { status?: string; service?: string; phase?: string; offline?: boolean };

const STEPS = [
  {
    href: '/map',
    title: 'نقشه نزدیک',
    body: 'شعاع را عوض کن. فروشنده خانگی با برچسب «مبهم» — مختصات دقیق سرور نمی‌فرستد.',
  },
  {
    href: '/auth',
    title: 'ورود OTP',
    body: 'شماره 09123456789 → کد در ترمینال API (خط [SMS]) → ورود.',
  },
  {
    href: '/vendor',
    title: 'پنل فروشنده',
    body: 'ورود دمو → محصول/پست → موقعیت → لینک «مشاهده روی نقشه».',
  },
  {
    href: '/cart',
    title: 'سبد و پرداخت',
    body: 'محصول اضافه کن → ثبت سفارش → پرداخت بانک نمونه (کمیسیون ۱۰٪).',
  },
  {
    href: '/book',
    title: 'نوبت / درخواست خدمت',
    body: 'ساعت مطب را رزرو کن یا RFQ ثبت کن.',
  },
  {
    href: '/rfq',
    title: 'پیشنهادهای خدمت',
    body: 'پیشنهادها را ببین و یکی را قبول کن → سفارش RFQ.',
  },
  {
    href: '/admin',
    title: 'کنسول ادمین',
    body: 'ورود ادمین → آمار پلتفرم و لیست سفارش‌ها.',
  },
  {
    href: '/profile',
    title: 'پروفایل',
    body: 'نام را ویرایش کن.',
  },
  {
    href: '/messages',
    title: 'پیام‌ها',
    body: 'چت سفارش و اعلان‌ها.',
  },
];

export default function TourPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await apiFetch<Health>('/health');
      if (r.ok && r.data) {
        setHealth(r.data);
        setOffline(false);
      } else {
        setOffline(true);
      }
    })();
  }, []);

  return (
    <main className="page">
      <div className="top-nav">
        <div className="brand">
          <h1 className="h1">تور دمو</h1>
          <p className="caption">برای بررسی‌کننده‌ها · v1.9</p>
        </div>
        <Link href="/" className="btn-ghost">
          خانه
        </Link>
      </div>

      <section className="card stack-2">
        <h2 className="h2">وضعیت API</h2>
        {offline ? (
          <div className="alert alert-error">
            API پاسخ نمی‌دهد.
            <code className="mono" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
              cd apps\api &amp;&amp; npm run dev
            </code>
          </div>
        ) : (
          <div className="alert alert-ok">
            آنلاین · {health?.service} · phase {health?.phase}
          </div>
        )}
        <p className="caption">
          راهنمای متنی GitHub:{' '}
          <a href="https://github.com/mohsen-niksirat/NazdikStore/blob/main/REVIEW_GUIDE.md" target="_blank" rel="noreferrer">
            REVIEW_GUIDE.md
          </a>
        </p>
      </section>

      <section className="stack-3">
        {STEPS.map((s, i) => (
          <article key={s.href} className="list-card stack-2">
            <div className="flex items-center gap-2">
              <span className="tag">{String(i + 1).padStart(2, '0')}</span>
              <strong className="h2">{s.title}</strong>
            </div>
            <p className="body-muted text-sm">{s.body}</p>
            <Link href={s.href} className="btn-secondary">
              رفتن به {s.title}
            </Link>
          </article>
        ))}
      </section>

      <section className="card stack-2">
        <h2 className="h2">بعد از تست</h2>
        <p className="body-muted text-sm">
          بازخورد را در GitHub Issue با تمپلیت <strong>First-look checklist</strong> ثبت کن.
        </p>
        <a
          className="btn-primary"
          href="https://github.com/mohsen-niksirat/NazdikStore/issues/new/choose"
          target="_blank"
          rel="noreferrer"
        >
          ثبت بازخورد در GitHub
        </a>
      </section>
    </main>
  );
}
