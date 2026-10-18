'use client';
import type { ReactNode } from 'react';

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/** Segmented control: a group of toggle buttons with aria-pressed. */
export function Seg<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: SegOption<NoInfer<T>>[];
  value: T | null;
  onChange(v: NoInfer<T>): void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

/** A list row with a title, optional detail and an iOS-style switch. The whole row is the label. */
export function SwitchRow({ title, detail, checked, onChange, small }: {
  title: string;
  detail?: string;
  checked: boolean;
  onChange(v: boolean): void;
  small?: boolean;
}) {
  return (
    <label className="row">
      <span className="grow">
        <b style={small ? { fontSize: 15 } : undefined}>{title}</b>
        {detail && <span className={small ? 'tiny' : 'small'}>{detail}</span>}
      </span>
      <input type="checkbox" className="sw" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Large radio choice card. */
export function Choice({ name, title, detail, checked, onChange, size = 17 }: {
  name: string;
  title: string;
  detail: string;
  checked: boolean;
  onChange(): void;
  size?: number;
}) {
  return (
    <label className="choice">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>
        <b style={{ fontSize: size, display: 'block' }}>{title}</b>
        <span className="small">{detail}</span>
      </span>
    </label>
  );
}
