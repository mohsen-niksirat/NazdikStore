import Link from 'next/link';
import { MapPin, ShieldCheck, Store } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-auth flex-col justify-center px-5 py-10">
      <header className="mb-10 text-center">
        <div className="mb-3 text-3xl font-bold tracking-tight text-ink">نزدیک استور</div>
        <div className="chip-proximity">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          فروشگاه‌های نزدیک شما
        </div>
        <p className="mt-5 text-sm leading-7 text-ink-muted">
          بازارچه محلی چندفروشنده — نوبت، سفارش و درخواست خدمات، نزدیک خودتان.
        </p>
      </header>

      <section className="card-auth space-y-4">
        <h1 className="text-xl font-bold text-ink">شروع کنید</h1>
        <p className="text-sm text-ink-muted">
          با شماره موبایل وارد شوید. کد تایید پیامک می‌شود.
        </p>
        <Link href="/auth" className="btn-primary">
          ورود / ثبت‌نام
        </Link>
        <Link href="/map" className="btn-primary !bg-transparent !text-accent border border-accent">
          مشاهده نقشه نزدیک
        </Link>
        <Link href="/feed" className="btn-primary !bg-transparent !text-accent border border-accent">
          خوراک محلی
        </Link>
      </section>

      <section className="mt-8 space-y-3 text-sm text-ink-muted">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span>ورود امن با پیامک — بدون رمز عبور</span>
        </div>
        <div className="flex items-start gap-2">
          <Store className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span>فروشنده‌ها: پزشکی، غذا، خدمات میدانی، زیبایی</span>
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-ink-muted">
        Phase 1 · Auth &amp; Profiles
      </p>
    </main>
  );
}
