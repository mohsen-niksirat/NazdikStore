import Link from 'next/link';
import { MapPin, ShieldCheck, Store } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="page page-center">
      <header className="brand center mb-4">
        <div className="chip-proximity mx-auto">
          <MapPin aria-hidden />
          فروشگاه‌های نزدیک شما
        </div>
        <h1 className="brand-title mt-3">نزدیک استور</h1>
        <p className="brand-sub mt-2">
          بازارچه محلی چندفروشنده — نوبت، سفارش و درخواست خدمات، نزدیک خودتان.
        </p>
      </header>

      <section className="card card-hero stack-4">
        <div>
          <h2 className="h1">شروع کنید</h2>
          <p className="body-muted mt-2">
            با شماره موبایل وارد شوید. کد تایید پیامک می‌شود — بدون رمز عبور.
          </p>
        </div>
        <div className="btn-row">
          <Link href="/auth" className="btn-primary">
            ورود / ثبت‌نام
          </Link>
          <Link href="/map" className="btn-secondary">
            مشاهده نقشه نزدیک
          </Link>
          <Link href="/feed" className="btn-secondary">
            خوراک محلی
          </Link>
          <Link href="/vendor" className="btn-secondary">
            پنل فروشنده
          </Link>
          <Link href="/cart" className="btn-secondary">
            سبد خرید
          </Link>
          <Link href="/admin" className="btn-secondary">
            کنسول ادمین
          </Link>
          <Link href="/messages" className="btn-secondary">
            پیام‌ها و اعلان‌ها
          </Link>
        </div>
      </section>

      <section className="stack-3">
        <div className="feature">
          <ShieldCheck aria-hidden />
          <span>ورود امن با پیامک — کد یک‌بارمصرف</span>
        </div>
        <div className="feature">
          <Store aria-hidden />
          <span>فروشنده‌ها: پزشکی، غذا، خدمات میدانی، زیبایی</span>
        </div>
        <div className="feature">
          <MapPin aria-hidden />
          <span>مکان خانگی فروشنده‌ها مبهم‌سازی می‌شود (۲۰۰ متر)</span>
        </div>
      </section>

      <p className="footer-note">NazdikStore · hyperlocal marketplace</p>
    </main>
  );
}
