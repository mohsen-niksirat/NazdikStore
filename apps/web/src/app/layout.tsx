import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { SWRegister } from './sw-register';
import { NotificationBell } from '@/components/notification-bell';

export const metadata: Metadata = {
  title: 'نزدیک استور | NazdikStore',
  description: 'فروشگاه‌ها و خدمات نزدیک شما — hyperlocal marketplace',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F6B5C',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            background: 'rgba(247,244,239,0.92)',
            borderBottom: '1px solid var(--line)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="mx-auto"
            style={{
              width: 'min(100% - 24px, 440px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 52,
              gap: 8,
            }}
          >
            <Link href="/" className="brand-title" style={{ fontSize: '1.05rem', textDecoration: 'none' }}>
              نزدیک استور
            </Link>
            <div className="flex items-center gap-2">
              <Link href="/map" className="btn-ghost" style={{ minHeight: 36 }}>
                نقشه
              </Link>
              <NotificationBell />
            </div>
          </div>
        </header>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
