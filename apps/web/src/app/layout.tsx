import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import './globals.css';
import { SWRegister } from './sw-register';
import { NotificationBell } from '@/components/notification-bell';
import { ApiStatusChip } from '@/components/api-status';
import { ThemeBoot } from '@/components/theme-boot';
import { BottomNav } from '@/components/bottom-nav';

export const metadata: Metadata = {
  title: 'نزدیک استور | NazdikStore',
  description: 'بازارچه محلی — فروشگاه‌ها و خدمات نزدیک شما',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0D7A66',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
      </head>
      <body>
        <ThemeBoot />
        <header className="app-header">
          <div className="app-header-inner">
            <Link href="/" className="logo">
              <span className="logo-mark" aria-hidden>
                <MapPin style={{ width: 16, height: 16 }} />
              </span>
              <span className="logo-text">نزدیک استور</span>
            </Link>
            <nav className="nav-chips" aria-label="ناوبری">
              <Link href="/tour" className="nav-link">
                تور
              </Link>
              <Link href="/map" className="nav-link">
                نقشه
              </Link>
              <Link href="/search" className="nav-link">
                جستجو
              </Link>
              <Link href="/settings" className="nav-link">
                تنظیمات
              </Link>
              <ApiStatusChip />
              <NotificationBell />
            </nav>
          </div>
        </header>
        <div className="brand-bar" aria-hidden />
        {children}
        <BottomNav />
        <SWRegister />
      </body>
    </html>
  );
}
