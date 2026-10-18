import Link from 'next/link';
import type { ReactNode } from 'react';
import { Chev, Icon, type IconName } from './Icon';
import type { CmpRowData } from '@/lib/sample/household';

/** Black = chosen, teal = served. */
export function ChosenBar({ chosenPct, size }: { chosenPct: number; size?: 'thin' | 'thick' }) {
  const v = Math.max(0, Math.min(100, chosenPct));
  return (
    <span className={`bar${size ? ` ${size}` : ''}`} role="img" aria-label={`${Math.round(v)}% chosen, ${Math.round(100 - v)}% served`}>
      <span style={{ width: `${v}%` }} />
    </span>
  );
}

export function PlatformChosen({ name, pct }: { name: string; pct: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="kv"><b>{name}</b><span className="small">{Math.round(pct)}% chosen</span></span>
      <ChosenBar chosenPct={pct} size="thin" />
    </div>
  );
}

export function ChosenSummary({ chosenPct, children }: { chosenPct: number; children: ReactNode }) {
  const c = Math.round(chosenPct);
  return (
    <div className="card" style={{ padding: 18, gap: 12 }}>
      <div className="split" style={{ alignItems: 'flex-start' }}>
        <span><span className="big-num">{c}%</span><span className="small">Chosen</span></span>
        <span style={{ textAlign: 'right' }}><span className="big-num" style={{ color: 'var(--accent-t)' }}>{100 - c}%</span><span className="small">Served</span></span>
      </div>
      <ChosenBar chosenPct={c} size="thick" />
      {children}
    </div>
  );
}

export function CmpRow({ r }: { r: CmpRowData }) {
  return (
    <div className="cmp-row">
      <span className="nm">{r.n}{r.s && <small>{r.s}</small>}</span>
      <span className="cmp-track">
        <span className={`cmp-fill${r.k === 'r' ? ' dashed' : ''}`} style={{ width: `${Math.min(100, (r.v / 35) * 100)}%`, background: r.c }} />
      </span>
      <span className="cmp-val">{r.v}%</span>
    </div>
  );
}

export function Note({ icon = 'info', children, className = 'outline' }: { icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <div className={`${className} note`}>
      <Icon name={icon} />
      <span className="small">{children}</span>
    </div>
  );
}

/** A tappable outline/card block with a title row and chevron. */
export function NavCard({ href, title, children, variant = 'outline' }: { href: string; title: ReactNode; children?: ReactNode; variant?: 'outline' | 'card' }) {
  return (
    <Link href={href} className={variant}>
      <span className="split" style={{ fontSize: 16, fontWeight: 700 }}>{title}<Chev /></span>
      {children}
    </Link>
  );
}

export function SampleBanner() {
  return (
    <Link href="/connect" className="banner">
      <Icon name="info" />
      <span>Sample data. Upload your export to see your own feed.</span>
      <Icon name="chev" style={{ width: 16, height: 16 }} />
    </Link>
  );
}

/** Placeholder blocks with fixed heights while stored data loads (avoids content jumps). */
export function Loading({ blocks = [120, 64, 96] }: { blocks?: number[] }) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {blocks.map((h, i) => <div key={i} className="skeleton" style={{ height: h }} />)}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="card empty">
      <b className="b16">{title}</b>
      <span className="small">{children}</span>
      {action && <Link href={action.href} className="btn btn-2" style={{ marginTop: 4 }}>{action.label}</Link>}
    </div>
  );
}
