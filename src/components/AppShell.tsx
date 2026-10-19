'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { ToastProvider } from './Toast';
import { HouseholdProvider, useHouseholdAlertCount } from './HouseholdProvider';
import { GoogleAutoSync } from './GoogleAutoSync';
import { TABS, activeTab, isFullScreen, noteNavigation, type TabId } from '@/lib/ui/nav';
import { applyTheme, getThemePref } from '@/lib/ui/prefs';

const TAB_ICON: Record<TabId, IconName> = { home: 'home', timeline: 'trend', household: 'people', settings: 'sliders' };

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <HouseholdProvider>
        <RouteEffects />
        <GoogleAutoSync />
        <div className="app">{children}</div>
        <TabBar />
      </HouseholdProvider>
    </ToastProvider>
  );
}

function TabBar() {
  const path = usePathname();
  const hidden = isFullScreen(path);
  const current = activeTab(path);
  const alerts = useHouseholdAlertCount();
  return (
    <nav className={`tabbar${hidden ? ' hidden' : ''}`} aria-label="Main" aria-hidden={hidden || undefined} inert={hidden || undefined}>
      {TABS.map((t) => (
        <Link key={t.id} href={t.href} aria-current={current === t.id ? 'page' : undefined}>
          <Icon name={TAB_ICON[t.id]} />
          {t.label}
          {t.id === 'household' && alerts > 0 && <span className="badge" role="img" aria-label={`${alerts} alert${alerts === 1 ? '' : 's'}`} />}
        </Link>
      ))}
    </nav>
  );
}

/** Focus the page heading after each in-app navigation, track history depth, follow system theme. */
function RouteEffects() {
  const path = usePathname();
  const first = useRef(true);

  useEffect(() => {
    noteNavigation();
    if (first.current) { first.current = false; return; }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => {
      const h = document.querySelector<HTMLElement>('main h1');
      if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }, reduce ? 0 : 60);
    return () => window.clearTimeout(id);
  }, [path]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (getThemePref() === 'system') applyTheme('system'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return null;
}
