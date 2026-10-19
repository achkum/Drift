'use client';
// Inline SVG QR code (encoding by the `qrcode` package, drawn here; no canvas, no network).
import { useMemo } from 'react';
import QRCode from 'qrcode';

export function QrCode({ text, size = 168, label }: { text: string; size?: number; label: string }) {
  const path = useMemo(() => {
    try {
      const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
      const n = qr.modules.size;
      let d = '';
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
      return { d, n: n + 8 };
    } catch {
      return null;
    }
  }, [text]);
  if (!path) return null;
  return (
    <svg
      viewBox={`0 0 ${path.n} ${path.n}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      style={{ background: '#fff', borderRadius: 12, flex: 'none' }}
    >
      <path d={path.d} fill="#111" />
    </svg>
  );
}
