import type { SVGProps } from 'react';

const PATHS = {
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  chev: <path d="M6 3l5 5-5 5" />,
  down: <path d="M4 6l4 4 4-4" />,
  check: <path d="M3 8.5l3 3 7-7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  home: <path d="M4 10l8-6 8 6v10h-5v-6h-6v6H4z" />,
  trend: <path d="M3 17l5-6 4 4 9-9" />,
  people: (<><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .8 3 2.8 3 6" /></>),
  sliders: (<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
  phone: (<><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M11 18h2" /></>),
  lock: (<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  warn: (<><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17h.01" /></>),
  sparkle: (<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></>),
  sparkleOne: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  monitor: (<><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>),
  upload: (<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></>),
  external: (<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>),
} as const;

export type IconName = keyof typeof PATHS;

const VIEWBOX: Partial<Record<IconName, string>> = { chev: '0 0 16 16', down: '0 0 16 16', check: '0 0 16 16' };

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={VIEWBOX[name] ?? '0 0 24 24'} aria-hidden="true" focusable="false" {...rest}>
      {PATHS[name]}
    </svg>
  );
}

export function Chev() {
  return <Icon name="chev" className="chev" />;
}

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" strokeWidth="2.4" strokeLinecap="round" role="img" aria-label="Drift logo">
      <path d="M4 9c4-4 8 4 12 0s6-2 8 0" stroke="var(--t1)" />
      <path d="M4 19c4-4 8 4 12 0s6-2 8 0" stroke="var(--accent)" />
    </svg>
  );
}
