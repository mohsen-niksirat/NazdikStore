import type { ReactNode } from 'react';
import Link from 'next/link';

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body?: string;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="card stack-3 center" style={{ padding: '28px 18px' }}>
      <div
        aria-hidden
        style={{
          width: 48,
          height: 48,
          margin: '0 auto',
          borderRadius: 14,
          background: 'var(--accent-soft)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          fontWeight: 800,
        }}
      >
        ✦
      </div>
      <h2 className="h2">{title}</h2>
      {body && <p className="body-muted text-sm">{body}</p>}
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-secondary">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
