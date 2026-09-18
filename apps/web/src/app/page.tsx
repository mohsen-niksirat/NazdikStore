import Link from 'next/link';
import { MapPin, ShieldCheck, Store, Sparkles } from 'lucide-react';

const PATHS = [
  { href: '/map', label: 'نقشه نزدیک', desc: 'فروشنده‌ها و ETA' },
  { href: '/orders', label: 'سفارش‌های من', desc: 'پرداخت و رسید' },
  { href: '/book', label: 'نوبت شمسی', desc: 'رزرو مطب / خدمات' },
  { href: '/cart', label: 'سبد خرید', desc: 'کد تخفیف و پرداخت' },
  { href: '/vendor', label: 'پنل فروشنده', desc: 'محصول و سفارش' },
  { href: '/assistant', label: 'دستیار هوشمند', desc: 'جمله فارسی بگو' },
];

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <div className="chip-proximity">
          <MapPin aria-hidden />
          فروشگاه‌ها و خدمات نزدیک شما
        </div>
        <h1 className="mt-3">بازارچه محلی، در دسترس شما</h1>
        <p>
          نوبت، سفارش غذا، تعمیر و خرید — همه از فروشنده‌های اطراف، با مکان دقیق و امن.
        </p>
      </section>

      <section className="card card-hero stack-3">
        <div className="row-between">
          <div>
            <h2 className="h2">شروع سریع</h2>
            <p className="body-muted mt-1 text-sm">کد تخفیف امروز فعال است</p>
          </div>
          <span className="badge-hot">PERCENT20</span>
        </div>
        <div className="btn-row">
          <Link href="/auth" className="btn-primary">
            ورود / ثبت‌نام
          </Link>
          <Link href="/tour" className="btn-secondary">
            تور دمو
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        {PATHS.map((p) => (
          <Link key={p.href} href={p.href} className="list-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="h2">{p.label}</div>
            <div className="caption mt-1">{p.desc}</div>
          </Link>
        ))}
      </section>

      <section className="stack-2">
        <div className="feature">
          <ShieldCheck aria-hidden />
          <span>ورود امن با پیامک — بدون رمز عبور</span>
        </div>
        <div className="feature">
          <Store aria-hidden />
          <span>پزشکی · غذا · خدمات میدانی · زیبایی</span>
        </div>
        <div className="feature">
          <Sparkles aria-hidden />
          <span>مکان خانگی فروشنده‌ها مبهم‌سازی می‌شود (۲۰۰ متر)</span>
        </div>
      </section>

      <p className="footer-note">NazdikStore · hyperlocal marketplace</p>
    </main>
  );
}
