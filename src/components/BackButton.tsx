'use client';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { canGoBack } from '@/lib/ui/nav';

/** Goes back in history when the user arrived from inside the app, else to `fallback`. */
export function BackButton({ fallback, close = false, label }: { fallback: string; close?: boolean; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label ?? (close ? 'Close' : 'Back')}
      onClick={() => (canGoBack() ? router.back() : router.push(fallback))}
    >
      <Icon name={close ? 'close' : 'back'} />
    </button>
  );
}

export function useGoBack(fallback: string) {
  const router = useRouter();
  return () => (canGoBack() ? router.back() : router.push(fallback));
}
