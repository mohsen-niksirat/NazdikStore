import type { ReactNode } from 'react';
import Link from 'next/link';

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
  icon = '✦',
}: {
  title: string;
  body?: string;
  actionHref?: string;
  actionLabel?: string;
  icon?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card stack-3 center" style={{ padding: '28px 18px' }}>
      <div
        aria-hidden
        style={{
          width: 52,
          height: 52,
          margin: '0 auto',
          borderRadius: 16,
          background: 'var(--grad-hero)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          fontWeight: 800,
        }}
      >
        {icon}
      </div>
      <h2 className="h2">{title}</h2>
      {body && <p className="body-muted text-sm">{body}</p>}
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-secondary">
          {actionLabel}
        </Link>
      )}
      {children}
    </div>
  );
}
