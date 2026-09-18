import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SWRegister } from './sw-register';

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
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
