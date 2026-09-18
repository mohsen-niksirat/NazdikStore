import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="page page-center">
      <section className="card card-hero stack-3 center">
        <h1 className="h1">آفلاین هستید</h1>
        <p className="body-muted">
          اتصال اینترنت برقرار نیست. برخی صفحه‌ها از حافظه دستگاه باز می‌شوند؛ سفارش و چت نیاز به آنلاین بودن دارد.
        </p>
        <button type="button" className="btn-primary" onClick={() => location.reload()}>
          تلاش مجدد
        </button>
        <Link href="/" className="btn-secondary">
          صفحه اصلی
        </Link>
      </section>
    </main>
  );
}
