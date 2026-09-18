'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'خانه', icon: HomeIcon },
  { href: '/map', label: 'نقشه', icon: MapIcon },
  { href: '/orders', label: 'سفارش', icon: BagIcon },
  { href: '/profile', label: 'پروفایل', icon: UserIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="bottom-nav"
      aria-label="ناوبری اصلی"
      style={{
        position: 'fixed',
        bottom: 0,
        insetInline: 0,
        zIndex: 50,
        background: 'rgba(255,255,255,0.94)',
        borderTop: '1px solid var(--line)',
        backdropFilter: 'blur(12px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        className="mx-auto"
        style={{
          width: 'min(100%, 440px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)',
          minHeight: 56,
        }}
      >
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                textDecoration: 'none',
                color: active ? 'var(--accent)' : 'var(--ink-muted)',
                fontWeight: active ? 700 : 500,
                fontSize: '0.7rem',
              }}
            >
              <t.icon />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9z" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8a3 3 0 0 1 6 0" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.5-4 12-4 14 0" />
    </svg>
  );
}
