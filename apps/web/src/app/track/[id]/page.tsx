'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TrackById({ params }: { params: { id: string } }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/track?order=${encodeURIComponent(params.id)}`);
  }, [params.id, router]);
  return (
    <main className="page page-center">
      <div className="card body-muted center">در حال باز کردن رهگیری…</div>
    </main>
  );
}
