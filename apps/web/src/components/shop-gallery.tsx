'use client';

/**
 * D3 — Shop gallery strip (placeholder tiles + product cards).
 */

export function ShopGallery({
  title,
  items,
}: {
  title?: string;
  items: Array<{ id: string; label: string; hue?: string }>;
}) {
  return (
    <section className="stack-2">
      {title && <h2 className="h2 mb-2">{title}</h2>}
      <div
        style={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridAutoColumns: 'minmax(120px, 1fr)',
          gap: 10,
          overflowX: 'auto',
          paddingBottom: 4,
        }}
      >
        {items.map((it) => (
          <div key={it.id} className="list-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              aria-hidden
              style={{
                height: 88,
                background: `linear-gradient(145deg, ${it.hue || 'var(--accent)'}, var(--ink))`,
                opacity: 0.85,
              }}
            />
            <div className="text-xs font-bold" style={{ padding: '8px 10px' }}>
              {it.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
