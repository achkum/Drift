'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Bottom sheet dialog: Escape and backdrop close it, focus moves in and is restored on close. */
export function Sheet({ open, onClose, title, children, role = 'dialog' }: {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  role?: 'dialog' | 'alertdialog';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (first ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div className="sheet-bg" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="sheet" role={role} aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="handle" />
        <b id={titleId} style={{ fontSize: 18 }}>{title}</b>
        {children}
      </div>
    </>
  );
}
