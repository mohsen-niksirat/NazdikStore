'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

/** Sticky API status chip — shows if port 4000 is reachable */
export function ApiStatusChip() {
  const [state, setState] = useState<'checking' | 'ok' | 'down'>('checking');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    let alive = true;
    async function check() {
      const r = await apiFetch<{ status?: string }>('/health');
      if (!alive) return;
      if (r.ok) {
        setState('ok');
        setDetail('API متصل');
      } else {
        setState('down');
        setDetail(r.error || 'API قطع');
      }
    }
    void check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <button
      type="button"
      title={detail}
      className="tag"
      style={{
        background: state === 'ok' ? 'var(--accent-soft)' : 'rgba(180,35,24,.12)',
        color: state === 'ok' ? 'var(--accent)' : 'var(--danger)',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      onClick={() => {
        if (state === 'down') {
          alert(
            'API روی پورت ۴۰۰۰ نیست.\n\ncd apps\\api\nnpm run dev',
          );
        }
      }}
    >
      {state === 'checking' ? '…' : state === 'ok' ? 'API ✓' : 'API قطع'}
    </button>
  );
}
