'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { apiFetch, getToken } from '@/lib/api';

type Notice = { id: string; topic: string; createdAt: string };

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);

  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    async function load() {
      const r = await apiFetch<Notice[]>('/notifications');
      if (!alive || !r.ok) return;
      setItems((r.data || []).slice(0, 8));
      setCount((r.data || []).length);
    }
    void load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-ghost"
        aria-label="اعلان‌ها"
        onClick={() => setOpen((v) => !v)}
        style={{ position: 'relative' }}
      >
        <Bell style={{ width: 20, height: 20 }} aria-hidden />
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              insetInlineStart: 0,
              background: 'var(--danger)',
              color: '#fff',
              borderRadius: 999,
              minWidth: 16,
              height: 16,
              fontSize: 10,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: '100%',
            insetInlineEnd: 0,
            zIndex: 40,
            minWidth: 240,
            maxWidth: 300,
            boxShadow: 'var(--shadow)',
          }}
        >
          <div className="h2 mb-2">اعلان‌ها</div>
          {items.length === 0 && <p className="caption">اعلانی نیست</p>}
          {items.map((n) => (
            <div key={n.id} className="caption" style={{ padding: '4px 0' }}>
              {n.topic}
            </div>
          ))}
          <Link href="/messages" className="btn-secondary" style={{ marginTop: 8, minHeight: 40 }}>
            همه پیام‌ها
          </Link>
        </div>
      )}
    </div>
  );
}
