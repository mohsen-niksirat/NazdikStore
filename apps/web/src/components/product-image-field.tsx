'use client';

/**
 * P21 — Product image picker on vendor board (base64 ≤5MB, JPEG/PNG only).
 */

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

export function ProductImageField({
  productId,
  onUploaded,
}: {
  productId: string;
  onUploaded?: (dataUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const onPick = async (file: File | null) => {
    if (!file || !productId) return;
    setMsg(null);
    if (file.size > 5 * 1024 * 1024) {
      setMsg('حجم تصویر بیشتر از ۵ مگابایت است');
      return;
    }
    if (!/^image\/(jpeg|png)$/i.test(file.type)) {
      setMsg('فقط JPEG یا PNG');
      return;
    }
    setBusy(true);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read fail'));
      reader.readAsDataURL(file);
    });
    const r = await apiFetch<{ dataUrl: string; bytes: number }>(
      `/vendors/me/products/${productId}/image`,
      {
        method: 'POST',
        body: JSON.stringify({ dataUrl }),
      },
    );
    setBusy(false);
    if (!r.ok || !r.data) {
      setMsg(r.error || 'آپلود ناموفق');
      return;
    }
    setPreview(r.data.dataUrl);
    setMsg(`تصویر ذخیره شد (${Math.round(r.data.bytes / 1024)} کیلوبایت)`);
    onUploaded?.(r.data.dataUrl);
  };

  return (
    <div className="stack-2">
      <label className="btn-secondary" style={{ cursor: 'pointer' }}>
        {busy ? 'در حال آپلود…' : 'افزودن تصویر محصول'}
        <input
          type="file"
          accept="image/jpeg,image/png"
          style={{ display: 'none' }}
          onChange={(e) => void onPick(e.target.files?.[0] || null)}
        />
      </label>
      {msg && <div className="caption">{msg}</div>}
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="تصویر محصول"
          style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid var(--line)' }}
        />
      )}
    </div>
  );
}
