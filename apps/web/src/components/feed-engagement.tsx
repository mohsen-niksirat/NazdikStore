'use client';

/**
 * D1 — Like / save toggle for feed posts.
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export function FeedEngagement({ postId }: { postId: string }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [saveCount, setSaveCount] = useState(0);

  useEffect(() => {
    (async () => {
      const r = await apiFetch<{ liked: boolean; saved: boolean; likeCount: number; saveCount: number }>(
        `/feed/${postId}/engagement`,
      );
      if (r.ok && r.data) {
        setLiked(r.data.liked);
        setSaved(r.data.saved);
        setLikeCount(r.data.likeCount);
        setSaveCount(r.data.saveCount);
      }
    })();
  }, [postId]);

  const toggle = async (kind: 'like' | 'save') => {
    const token = localStorage.getItem('nazdik_token');
    if (!token) {
      const login = await apiFetch<{ tokens: { accessToken: string } }>('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ role: 'CONSUMER', id: 'consumer_demo' }),
      });
      if (login.ok && login.data) {
        localStorage.setItem('nazdik_token', login.data.tokens.accessToken);
      }
    }
    const path = kind === 'like' ? 'like' : 'save';
    const r = await apiFetch<{ liked?: boolean; saved?: boolean; likeCount?: number; saveCount?: number }>(
      `/feed/${postId}/${path}`,
      { method: 'POST' },
    );
    if (!r.ok || !r.data) return;
    if (kind === 'like') {
      setLiked(Boolean(r.data.liked));
      setLikeCount(r.data.likeCount ?? 0);
    } else {
      setSaved(Boolean(r.data.saved));
      setSaveCount(r.data.saveCount ?? 0);
    }
  };

  return (
    <div className="flex gap-2">
      <button type="button" className="pill" onClick={() => void toggle('like')}>
        {liked ? '♥' : '♡'} {likeCount}
      </button>
      <button type="button" className="pill" onClick={() => void toggle('save')}>
        {saved ? '★' : '☆'} {saveCount}
      </button>
    </div>
  );
}
